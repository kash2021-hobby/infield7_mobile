import { useCallback, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { api } from "@/api";
import { BackBtn, ScreenShell, TopBar } from "@/chrome";
import { loadSession, type Session } from "@/session";
import { colors, styles } from "@/theme";

type Location = "inside" | "leaving" | "away" | "no_signal";

type Board = {
  counts: { onDuty: number; notIn: number; done: number; onLeave: number };
  onDuty: {
    checkinId: string;
    userId: string;
    person: string;
    site: string | null;
    since: string;
    location: Location;
    lastSeenAt: string | null;
    distanceM?: number | null;
    fenceM?: number | null;
    beyondM?: number | null;
  }[];
  notIn: { userId: string; person: string; shiftStart: string | null; late: boolean }[];
  done: { userId: string; person: string; site: string | null; checkedOutAt: string | null; checkoutKind: string | null; hoursToday: number }[];
  onLeave: { userId: string; person: string }[];
};

const locationText: Record<Location, { label: string; color: string; background: string }> = {
  inside: { label: "At site", color: colors.greenDeep, background: colors.greenSoft },
  leaving: { label: "Leaving", color: "#8A5A10", background: "#F8EFD6" },
  away: { label: "Left the site", color: colors.coral, background: colors.coralSoft },
  no_signal: { label: "No signal", color: colors.ink3, background: colors.cream2 },
};

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function ago(iso: string | null) {
  if (!iso) return "never seen";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "seen just now";
  if (minutes < 60) return `seen ${minutes} min ago`;
  return `seen ${Math.round(minutes / 60)} h ago`;
}

function hours(value: number) {
  const minutes = Math.round(value * 60);
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export default function OnDuty() {
  const [session, setSession] = useState<Session | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const current = await loadSession();
    if (!current) {
      router.replace("/login");
      return;
    }
    setSession(current);
    setLoading(true);
    try {
      setBoard(await api<Board>("/on-duty", {}, current.token));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => undefined);
    }, [refresh]),
  );

  async function checkOut(checkinId: string, at: Date) {
    if (!session) return;
    setError("");
    setMessage("");
    try {
      await api(`/check-ins/${checkinId}/check-out`, { method: "POST", body: JSON.stringify({ at: at.toISOString() }) }, session.token);
      setMessage(`Checked out at ${clock(at.toISOString())}. They were told.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check out");
    }
  }

  function confirmCheckOut(row: Board["onDuty"][number]) {
    Alert.alert(
      `Check out ${row.person}?`,
      "Use this when someone forgot. For an exact earlier time, use On duty on the website.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "1 hour ago", onPress: () => checkOut(row.checkinId, new Date(Date.now() - 3_600_000)) },
        { text: "Now", onPress: () => checkOut(row.checkinId, new Date()) },
      ],
    );
  }

  return (
    <ScreenShell>
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.cream }}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => refresh().catch(() => undefined)} />}
    >
      <TopBar
        title="On duty now"
        subtitle={board ? `${board.counts.onDuty} on duty · ${board.counts.notIn} not in yet` : "Who is in"}
        left={<BackBtn />}
      />
      <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.notice}>{message}</Text> : null}
      {board ? (
        <Text style={styles.sub}>
          {board.counts.onDuty} on duty · {board.counts.notIn} not in yet · {board.counts.done} finished · {board.counts.onLeave} on leave
        </Text>
      ) : null}

      <Text style={styles.label}>On duty</Text>
      {board && board.onDuty.length === 0 ? <Text style={styles.sub}>Nobody is checked in right now.</Text> : null}
      {board?.onDuty.map((row) => {
        const tag = locationText[row.location];
        return (
          <View key={row.checkinId} style={styles.card}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.ink, flex: 1 }}>{row.person}</Text>
              <View style={{ backgroundColor: tag.background, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ color: tag.color, fontSize: 12, fontWeight: "700" }}>{tag.label}</Text>
              </View>
            </View>
            <Text style={[styles.sub, { marginBottom: 0, marginTop: 4 }]}>
              {row.site ?? "Site"} · clock-in {clock(row.since)} · {ago(row.lastSeenAt)}
            </Text>
            {row.beyondM != null && row.beyondM > 0 && row.distanceM != null && row.fenceM != null ? (
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.coral, marginTop: 6 }}>
                {row.beyondM} m past the {row.fenceM} m fence · {row.distanceM} m from centre
              </Text>
            ) : row.distanceM != null ? (
              <Text style={{ fontSize: 13, color: colors.ink2, marginTop: 6 }}>{row.distanceM} m from centre</Text>
            ) : null}
            <Pressable onPress={() => confirmCheckOut(row)} style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.ink }}>Check out for them →</Text>
            </Pressable>
          </View>
        );
      })}

      <Text style={[styles.label, { marginTop: 8 }]}>Not in yet</Text>
      {board && board.notIn.length === 0 ? <Text style={styles.sub}>Everyone expected is in.</Text> : null}
      {board?.notIn.map((row) => (
        <View key={row.userId} style={[styles.card, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink, flex: 1 }}>{row.person}</Text>
          <Text style={{ fontSize: 13, color: row.late ? colors.coral : colors.ink3, fontWeight: row.late ? "700" : "500" }}>
            {row.shiftStart ? `${row.late ? "Late · " : ""}shift ${row.shiftStart}` : "No shift set"}
          </Text>
        </View>
      ))}

      <Text style={[styles.label, { marginTop: 8 }]}>Finished today</Text>
      {board && board.done.length === 0 ? <Text style={styles.sub}>Nobody has checked out yet.</Text> : null}
      {board?.done.map((row) => (
        <View key={row.userId} style={styles.card}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink }}>{row.person}</Text>
          <Text style={[styles.sub, { marginBottom: 0, marginTop: 4 }]}>
            {row.checkedOutAt ? `Out ${clock(row.checkedOutAt)}` : "No check-out"}
            {row.checkoutKind === "manager" ? " by a manager" : ""} · {hours(row.hoursToday)} today
          </Text>
        </View>
      ))}

      {board && board.onLeave.length > 0 ? (
        <>
          <Text style={[styles.label, { marginTop: 8 }]}>On leave</Text>
          <Text style={styles.sub}>{board.onLeave.map((row) => row.person).join(", ")}</Text>
        </>
      ) : null}
      </View>
    </ScrollView>
    </ScreenShell>
  );
}
