import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { api } from "@/api";
import { BackBtn, ScreenShell, TopBar } from "@/chrome";
import { loadSession, type Session } from "@/session";
import { colors, styles } from "@/theme";

type Shift = { id: string; name: string; startTime: string; endTime: string };
type Person = { userId: string; name: string };
type Assignment = { id: string; userId: string; shiftId: string; day: string };
type Roster = { today: string; shifts: Shift[]; people: Person[]; assignments: Assignment[] };
type Side = { userId: string; name: string; day: string | null; shift: string | null };
type Swap = { id: string; kind: "swap" | "cover"; status: string; note: string | null; requester: Side; target: Side };

const statusText: Record<string, string> = {
  waiting_colleague: "Waiting for your colleague",
  waiting_manager: "Waiting for a manager",
  approved: "Approved",
  declined: "Declined",
  rejected: "Not approved",
  cancelled: "Cancelled",
};

function addDays(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayLabel(iso: string | null) {
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

function side(value: Side) {
  return value.day ? `${value.shift ?? "shift"} · ${dayLabel(value.day)}` : "shift";
}

export default function ShiftsScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [asking, setAsking] = useState<string | null>(null);
  const [colleague, setColleague] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async (current?: Session) => {
    const sessionNow = current ?? (await loadSession());
    if (!sessionNow) return;
    setSession(sessionNow);
    const first = await api<Roster>("/roster", {}, sessionNow.token);
    const [body, swapBody] = await Promise.all([
      api<Roster>(`/roster?from=${first.today}&to=${addDays(first.today, 13)}`, {}, sessionNow.token),
      api<{ swaps: Swap[] }>("/shift-swaps", {}, sessionNow.token),
    ]);
    setRoster(body);
    setSwaps(swapBody.swaps);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  async function run(action: () => Promise<unknown>, done: string) {
    if (!session) return;
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(done);
      setAsking(null);
      setColleague(null);
      setNote("");
      await refresh(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  }

  function ask(assignmentId: string, targetUserId: string, targetAssignmentId?: string) {
    if (!session) return;
    run(
      () => api("/shift-swaps", { method: "POST", body: JSON.stringify({ assignmentId, targetUserId, targetAssignmentId, note: note || undefined }) }, session.token),
      "Request sent. Your colleague sees it in My shifts.",
    );
  }

  const me = session?.user.id;
  const shiftName = (id: string) => roster?.shifts.find((shift) => shift.id === id);
  const mine = roster?.assignments.filter((item) => item.userId === me) ?? [];
  const colleagues = roster?.people.filter((person) => person.userId !== me) ?? [];
  const incoming = swaps.filter((swap) => swap.target.userId === me && swap.status === "waiting_colleague");
  const outgoing = swaps.filter((swap) => swap.requester.userId === me);
  const manager = session?.user.role !== "employee";
  const approvals = manager
    ? swaps.filter((swap) => swap.status === "waiting_manager" && swap.requester.userId !== me && swap.target.userId !== me)
    : [];

  return (
    <ScreenShell>
      <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <TopBar title="My shifts" subtitle="Roster, swaps, and cover" left={<BackBtn />} />
        <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        {approvals.length > 0 ? <Text style={styles.label}>Waiting for your approval</Text> : null}
        {approvals.map((swap) => (
          <View key={swap.id} style={styles.card}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.ink }}>
              {swap.kind === "cover" ? `${swap.target.name} covers ${swap.requester.name}` : `${swap.requester.name} ↔ ${swap.target.name}`}
            </Text>
            <Text style={styles.sub}>{side(swap.requester)}{swap.kind === "swap" ? `  for  ${side(swap.target)}` : ""}</Text>
            {swap.note ? <Text style={styles.sub}>“{swap.note}”</Text> : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable style={[styles.button, { flex: 1 }]} onPress={() => session && run(() => api(`/shift-swaps/${swap.id}/decide`, { method: "POST", body: JSON.stringify({ approve: true }) }, session.token), "Approved. The roster is updated.")}>
                <Text style={styles.buttonText}>Approve</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.secondary, { flex: 1 }]} onPress={() => session && run(() => api(`/shift-swaps/${swap.id}/decide`, { method: "POST", body: JSON.stringify({ approve: false }) }, session.token), "Not approved.")}>
                <Text style={[styles.buttonText, styles.secondaryText]}>Reject</Text>
              </Pressable>
            </View>
          </View>
        ))}

        {incoming.length > 0 ? <Text style={styles.label}>Colleagues asking you</Text> : null}
        {incoming.map((swap) => (
          <View key={swap.id} style={styles.card}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.ink }}>
              {swap.kind === "cover" ? `${swap.requester.name} asks you to cover` : `${swap.requester.name} asks to swap`}
            </Text>
            <Text style={styles.sub}>
              {swap.kind === "cover" ? side(swap.requester) : `You take ${side(swap.requester)}. They take ${side(swap.target)}.`}
            </Text>
            {swap.note ? <Text style={styles.sub}>“{swap.note}”</Text> : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable style={[styles.button, { flex: 1 }]} onPress={() => session && run(() => api(`/shift-swaps/${swap.id}/respond`, { method: "POST", body: JSON.stringify({ accept: true }) }, session.token), "Accepted. A manager confirms it next.")}>
                <Text style={styles.buttonText}>Accept</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.secondary, { flex: 1 }]} onPress={() => session && run(() => api(`/shift-swaps/${swap.id}/respond`, { method: "POST", body: JSON.stringify({ accept: false }) }, session.token), "Declined.")}>
                <Text style={[styles.buttonText, styles.secondaryText]}>Decline</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <Text style={styles.label}>My next two weeks</Text>
        {roster && mine.length === 0 ? <Text style={styles.sub}>No shifts on the roster yet. Your manager adds them.</Text> : null}
        {mine.map((item) => {
          const shift = shiftName(item.shiftId);
          const open = asking === item.id;
          const theirShifts = colleague ? roster?.assignments.filter((other) => other.userId === colleague) ?? [] : [];
          const colleagueFree = colleague ? !roster?.assignments.some((other) => other.userId === colleague && other.day === item.day) : false;
          return (
            <View key={item.id} style={styles.card}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.ink }}>{dayLabel(item.day)}</Text>
              <Text style={styles.sub}>{shift ? `${shift.name} · ${shift.startTime}–${shift.endTime}` : "Shift"}</Text>
              {!open ? (
                <Pressable onPress={() => { setAsking(item.id); setColleague(null); }}>
                  <Text style={{ color: colors.greenDeep, fontWeight: "600", marginTop: 6 }}>Ask to swap or cover</Text>
                </Pressable>
              ) : (
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.label}>Who?</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {colleagues.map((person) => (
                      <Pressable
                        key={person.userId}
                        onPress={() => setColleague(person.userId)}
                        style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: colleague === person.userId ? colors.greenSoft : colors.cream2 }}
                      >
                        <Text style={{ color: colors.ink, fontWeight: colleague === person.userId ? "700" : "500" }}>{person.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {colleague ? (
                    <>
                      <TextInput style={[styles.input, { marginTop: 10 }]} placeholder="Note (optional)" placeholderTextColor={colors.ink3} value={note} onChangeText={setNote} />
                      {colleagueFree ? (
                        <Pressable style={styles.button} onPress={() => ask(item.id, colleague)}>
                          <Text style={styles.buttonText}>Ask them to cover this shift</Text>
                        </Pressable>
                      ) : null}
                      {theirShifts.map((other) => (
                        <Pressable key={other.id} style={[styles.button, styles.secondary]} onPress={() => ask(item.id, colleague, other.id)}>
                          <Text style={[styles.buttonText, styles.secondaryText]}>
                            Swap for their {shiftName(other.shiftId)?.name ?? "shift"} · {dayLabel(other.day)}
                          </Text>
                        </Pressable>
                      ))}
                      {!colleagueFree && theirShifts.length === 0 ? <Text style={styles.sub}>They have no shifts to swap in these two weeks.</Text> : null}
                    </>
                  ) : null}
                  <Pressable onPress={() => setAsking(null)}>
                    <Text style={{ color: colors.ink3, marginTop: 8 }}>Close</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}

        {outgoing.length > 0 ? <Text style={styles.label}>My requests</Text> : null}
        {outgoing.map((swap) => (
          <View key={swap.id} style={styles.card}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.ink }}>
              {swap.kind === "cover" ? `${swap.target.name} to cover` : `Swap with ${swap.target.name}`}
            </Text>
            <Text style={styles.sub}>{side(swap.requester)} · {statusText[swap.status] ?? swap.status}</Text>
            {swap.status === "waiting_colleague" || swap.status === "waiting_manager" ? (
              <Pressable onPress={() => session && run(() => api(`/shift-swaps/${swap.id}/cancel`, { method: "POST", body: "{}" }, session.token), "Request cancelled.")}>
                <Text style={{ color: colors.coral, fontWeight: "600", marginTop: 6 }}>Cancel request</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        </View>
      </ScrollView>
    </ScreenShell>
  );
}
