import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { api } from "@/api";
import { BackBtn, IconBtn, ScreenShell, TopBar } from "@/chrome";
import { AIMark, Chip, FooterNote, Kicker, accentFor, toneFor } from "@/copilot-ui";
import { loadSession } from "@/session";
import { colors, styles } from "@/theme";

type Item = {
  id: string;
  title: string;
  narrative: string;
  citation: string;
  suggestionTitle: string | null;
  status: string;
  tone?: string;
  label?: string;
};

type Brief = {
  paused?: boolean;
  weekStart: string;
  rangeLabel?: string;
  items: Item[];
  pulse?: { months: number; days: number; signalPct: number; people: number; tasks: number };
  settings?: { cadence: string };
};

export default function CopilotHome() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const session = await loadSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    if (session.user.role === "employee") {
      router.replace("/check-in");
      return;
    }
    setBrief(await api<Brief>("/brief", {}, session.token));
  }, []);

  useFocusEffect(
    useCallback(() => {
      setError("");
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  async function dismiss(id: string) {
    const session = await loadSession();
    if (!session) return;
    setError("");
    try {
      await api(`/brief/${id}/dismiss`, { method: "POST", body: "{}" }, session.token);
      setNotice("Dismissed. Nothing else changed.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not dismiss");
    }
  }

  const pulse = brief?.pulse ?? { months: 0, days: 0, signalPct: 0, people: 0, tasks: 0 };
  const pending = (brief?.items ?? []).filter((item) => item.status === "pending");
  const shown = pending.length ? pending : (brief?.items ?? []);

  return (
    <ScreenShell>
      <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ paddingBottom: 24 }}>
        <TopBar
          title="AI copilot"
          subtitle="Quiet analyst for your team"
          left={<BackBtn />}
          right={
            <IconBtn
              icon="settings"
              onPress={() =>
                Alert.alert(
                  "Model settings",
                  `Cadence is ${brief?.settings?.cadence === "daily" ? "daily digest" : "weekly"}. Change quiet hours and credits on the website.`,
                )
              }
            />
          }
        />
        {error ? (
          <Text style={[styles.error, { marginHorizontal: 20 }]}>
            {error}
            {error.includes("Credits") ? " Open billing on the website." : ""}
          </Text>
        ) : null}
        {notice ? <Text style={[styles.notice, { marginHorizontal: 20 }]}>{notice}</Text> : null}

        <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
          <Pressable onPress={() => router.push("/copilot/patterns")} style={styles.card}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }}>
                <AIMark size={22} color={colors.paper} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink }}>Learning from your team</Text>
                <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 3, lineHeight: 16 }}>
                  <Text style={{ color: colors.ink2, fontWeight: "700" }}>
                    {pulse.months ? `${pulse.months} month${pulse.months === 1 ? "" : "s"}` : "New workspace"}
                  </Text>
                  {" · "}
                  <Text style={{ color: colors.ink2, fontWeight: "700" }}>{pulse.people} people</Text>
                  {" · "}
                  <Text style={{ color: colors.ink2, fontWeight: "700" }}>
                    {pulse.tasks} task{pulse.tasks === 1 ? "" : "s"}
                  </Text>
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.green }} />
                <Text style={{ fontSize: 9, color: colors.greenDeep, fontWeight: "700", letterSpacing: 0.6, marginTop: 3 }}>LIVE</Text>
              </View>
            </View>
            <View style={{ marginTop: 14 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
                <Text style={{ fontSize: 10, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase", color: colors.ink3 }}>
                  Signal strength
                </Text>
                <Text style={{ fontSize: 10, fontWeight: "700", color: colors.ink2 }}>{pulse.signalPct}%</Text>
              </View>
              <View style={{ height: 6, borderRadius: 4, backgroundColor: colors.cream2, overflow: "hidden" }}>
                <View style={{ width: `${pulse.signalPct}%`, height: "100%", backgroundColor: colors.green }} />
              </View>
              <Text style={{ fontSize: 10, color: colors.ink3, marginTop: 6, lineHeight: 15 }}>
                {pulse.days} distinct check-in day{pulse.days === 1 ? "" : "s"} on file. Twenty-one days fills this bar. More days, sharper notes.
              </Text>
            </View>
          </Pressable>
        </View>

        {brief?.paused ? (
          <Text style={[styles.sub, { paddingHorizontal: 20 }]}>Copilot is paused. Turn it back on in website settings.</Text>
        ) : null}

        <Kicker inset={20}>{`${shown.length} insight${shown.length === 1 ? "" : "s"} for you today`}</Kicker>

        <View style={{ paddingHorizontal: 16, gap: 8 }}>
          {shown.length === 0 && !brief?.paused ? <Text style={styles.sub}>No insights today — check back after this week’s check-ins land.</Text> : null}
          {shown.map((item) => {
            const tone = toneFor(item);
            return (
              <View key={item.id} style={[styles.card, { borderLeftWidth: 4, borderLeftColor: accentFor(tone.tone), marginBottom: 0 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <Chip tone={tone.tone}>{tone.label}</Chip>
                  <Text style={{ fontSize: 10, color: colors.ink3 }}>{item.citation}</Text>
                </View>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.ink, lineHeight: 18 }}>{item.title}</Text>
                <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 6 }}>{item.narrative}</Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 12, alignItems: "center" }}>
                  <Pressable onPress={() => router.push(`/copilot/${item.id}`)} style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ fontSize: 11, fontWeight: "600", color: colors.ink2 }}>Show why →</Text>
                  </Pressable>
                  <View style={{ flex: 1 }} />
                  {item.status === "pending" ? (
                    <>
                      <Pressable onPress={() => dismiss(item.id)} style={[styles.button, styles.secondary, { marginTop: 0, paddingVertical: 7, paddingHorizontal: 12 }]}>
                        <Text style={[styles.buttonText, styles.secondaryText, { fontSize: 11 }]}>Dismiss</Text>
                      </Pressable>
                      <Pressable onPress={() => router.push(`/copilot/${item.id}`)} style={[styles.button, { marginTop: 0, paddingVertical: 7, paddingHorizontal: 12 }]}>
                        <Text style={[styles.buttonText, { fontSize: 11 }]}>Review</Text>
                      </Pressable>
                    </>
                  ) : (
                    <Text style={{ fontSize: 11, color: colors.ink3, textTransform: "capitalize" }}>{item.status}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 12, gap: 8 }}>
          <FooterNote>AI never acts on its own. It only surfaces patterns — you decide what to do.</FooterNote>
          <Pressable onPress={() => router.push("/copilot/briefing")} style={[styles.card, { flexDirection: "row", alignItems: "center", marginBottom: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink }}>Weekly brief</Text>
              <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 3 }}>
                {brief?.rangeLabel ? brief.rangeLabel : "Last seven days in one story"}
              </Text>
            </View>
            <Text style={{ fontSize: 13, color: colors.ink3 }}>→</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}
