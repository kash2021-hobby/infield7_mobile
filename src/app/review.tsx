import { useCallback, useMemo, useState } from "react";
import { Image, Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { API_URL, api } from "@/api";
import { Avatar, BackBtn, ScreenShell, TopBar } from "@/chrome";
import { Icon } from "@/icons";
import { loadSession, type Session } from "@/session";
import { colors, styles } from "@/theme";

type Flag = { id: string; label: string };

type Review = {
  id: string;
  person: string;
  phone?: string;
  site: string | null;
  flags: Flag[];
  status?: string;
  accuracyM: number;
  distanceM: number | null;
  checkedInAt: string;
  receivedAt: string;
  hasSelfie: boolean;
  reviewer?: string | null;
  reviewedAt?: string | null;
  note?: string | null;
};

function when(value: string) {
  return new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function telHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  return `tel:+${digits.length === 10 ? "91" : ""}${digits}`;
}

function flagColor(id: string) {
  if (id === "late" || id === "early_leave" || id === "no_checkout") return { bg: colors.amberSoft, fg: colors.ink };
  return { bg: colors.coralSoft, fg: colors.coral };
}

export default function ReviewScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState<"pending" | "decided">("pending");
  const [pendingItems, setPendingItems] = useState<Review[]>([]);
  const [decidedItems, setDecidedItems] = useState<Review[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async (current?: Session) => {
    const sessionNow = current ?? (await loadSession());
    if (!sessionNow) return;
    setSession(sessionNow);
    const [waiting, decided] = await Promise.all([
      api<{ checkins: Review[] }>("/check-ins/review?status=pending", {}, sessionNow.token),
      api<{ checkins: Review[] }>("/check-ins/review?status=decided", {}, sessionNow.token),
    ]);
    setPendingItems(waiting.checkins);
    setDecidedItems(decided.checkins);
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  async function decide(id: string, decision: "approve" | "reject") {
    if (!session) return;
    if (decision === "reject" && !(notes[id] ?? "").trim()) {
      setError("Add a reason before rejecting");
      return;
    }
    setBusy(id);
    setError("");
    setNotice("");
    try {
      await api(`/check-ins/${id}/review`, { method: "POST", body: JSON.stringify({ decision, note: notes[id] || undefined }) }, session.token);
      setNotice(decision === "approve" ? "Attendance updated. This check-in now counts." : "Check-in left out of attendance.");
      await refresh(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(null);
    }
  }

  const items = tab === "pending" ? pendingItems : decidedItems;
  const chips = useMemo(
    () => [
      { id: "pending" as const, label: `Waiting ${pendingItems.length}` },
      { id: "decided" as const, label: `Decided ${decidedItems.length}` },
    ],
    [pendingItems.length, decidedItems.length],
  );

  return (
    <ScreenShell>
      <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <TopBar title="Review check-ins" subtitle="Late, simulated, weak GPS, offline" left={<BackBtn />} />
        <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
        <Text style={styles.sub}>
          Approve to count it. Reject leaves it out of attendance. Simulated location only counts once approved.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          {chips.map((chip) => {
            const on = tab === chip.id;
            return (
              <Pressable
                key={chip.id}
                onPress={() => setTab(chip.id)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 999,
                  backgroundColor: on ? colors.ink : colors.paper,
                  borderWidth: 1,
                  borderColor: on ? colors.ink : colors.cream2,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: on ? colors.paper : colors.ink }}>{chip.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {loaded && items.length === 0 ? (
          <Text style={styles.sub}>{tab === "pending" ? "Nothing waiting. Every check-in is clear." : "No decisions in the last 30 days."}</Text>
        ) : null}

        {items.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Avatar name={item.person} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: "600", color: colors.ink }}>{item.person}</Text>
                <Text style={[styles.sub, { marginBottom: 0, marginTop: 2 }]}>
                  {item.site ?? "Unknown site"} · {when(item.checkedInAt)}
                  {item.flags.some((flag) => flag.id === "offline") ? ` · arrived ${when(item.receivedAt)}` : ""}
                </Text>
              </View>
              {tab === "decided" ? (
                <Text style={{ fontSize: 11, fontWeight: "700", color: item.status === "approved" ? colors.greenDeep : colors.ink3 }}>
                  {item.status === "approved" ? "Approved" : "Rejected"}
                </Text>
              ) : null}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {item.flags.map((flag) => {
                const tone = flagColor(flag.id);
                return (
                  <Text
                    key={flag.id}
                    style={{ backgroundColor: tone.bg, color: tone.fg, fontSize: 12, fontWeight: "600", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}
                  >
                    {flag.label}
                  </Text>
                );
              })}
            </View>
            <Text style={[styles.sub, { marginTop: 8, marginBottom: 0 }]}>
              GPS ±{item.accuracyM} m{item.distanceM !== null ? ` · ${item.distanceM} m from centre` : ""}
            </Text>
            {item.hasSelfie && session ? (
              photo === item.id ? (
                <Image
                  source={{ uri: `${API_URL}/check-ins/${item.id}/selfie`, headers: { authorization: `Bearer ${session.token}` } }}
                  style={{ width: 160, height: 200, borderRadius: 16, marginTop: 10, backgroundColor: colors.cream2 }}
                  resizeMode="cover"
                />
              ) : (
                <Pressable onPress={() => setPhoto(item.id)}>
                  <Text style={{ color: colors.greenDeep, fontWeight: "600", marginTop: 10 }}>Show photo</Text>
                </Pressable>
              )
            ) : null}
            {tab === "pending" ? (
              <>
                <TextInput
                  style={[styles.input, { marginTop: 10 }]}
                  placeholder="Reason (required to reject)"
                  placeholderTextColor={colors.ink3}
                  value={notes[item.id] ?? ""}
                  onChangeText={(text) => setNotes({ ...notes, [item.id]: text })}
                />
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable style={[styles.button, { flex: 1, marginTop: 0 }]} disabled={busy === item.id} onPress={() => void decide(item.id, "approve")}>
                    <Text style={styles.buttonText}>Approve</Text>
                  </Pressable>
                  <Pressable style={[styles.button, styles.secondary, { flex: 1, marginTop: 0 }]} disabled={busy === item.id} onPress={() => void decide(item.id, "reject")}>
                    <Text style={[styles.buttonText, styles.secondaryText]}>Reject</Text>
                  </Pressable>
                  {item.phone && telHref(item.phone) ? (
                    <Pressable
                      style={[styles.button, styles.secondary, { marginTop: 0, paddingHorizontal: 14 }]}
                      onPress={() => void Linking.openURL(telHref(item.phone ?? ""))}
                    >
                      <Icon name="phone" size={16} color={colors.ink} />
                    </Pressable>
                  ) : null}
                </View>
              </>
            ) : (
              <Text style={[styles.sub, { marginTop: 8, marginBottom: 0 }]}>
                {item.reviewer ?? "—"}{item.reviewedAt ? ` · ${when(item.reviewedAt)}` : ""}
                {item.note ? ` · “${item.note}”` : ""}
              </Text>
            )}
          </View>
        ))}
        </View>
      </ScrollView>
    </ScreenShell>
  );
}
