import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import Svg, { Circle } from "react-native-svg";
import { api } from "@/api";
import { FilterChip, IconBtn, ScreenShell, TopBar } from "@/chrome";
import { loadSession } from "@/session";
import { colors, styles } from "@/theme";

type Stop = { siteId: string; site: string; lat: number; lng: number; km: number; tasks: { id: string; title: string }[] };
type Done = { id: string; site: string | null; lat: number; lng: number; km: number; late: boolean; checkedInAt: string; checkedOutAt: string | null; hours: number | null };
type Upcoming = { id: string; title: string; site: string | null; dueOn: string | null };
type Route = {
  day: string;
  done: Done[];
  remaining: Stop[];
  skipped: { id: string; title: string }[];
  kmDone: number;
  kmRemaining: number;
  locked?: boolean;
  visitsGoal?: number | null;
  upcoming?: Upcoming[];
};

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function firstName(name: string | null | undefined) {
  if (!name) return "there";
  return name.trim().split(/\s+/)[0];
}

export default function MyVisits() {
  const [route, setRoute] = useState<Route | null>(null);
  const [error, setError] = useState("");
  const [who, setWho] = useState("");
  const [tab, setTab] = useState<"today" | "upcoming" | "done">("today");

  const refresh = useCallback(async () => {
    const session = await loadSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    setWho(session.user.name || session.user.phone);
    let query = "";
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.granted) {
        const position = await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 200 });
        if (position) query = `?lat=${position.coords.latitude}&lng=${position.coords.longitude}`;
      }
    } catch {
      query = "";
    }
    setRoute(await api<Route>(`/visits${query}`, {}, session.token));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  const doneN = route?.done.length ?? 0;
  const leftN = route?.remaining.length ?? 0;
  const todayN = doneN + leftN;
  const goal = route?.visitsGoal && route.visitsGoal > 0 ? route.visitsGoal : Math.max(todayN, 1);
  const pct = Math.min(1, doneN / goal);
  const leftToGoal = Math.max(0, goal - doneN);
  const upcoming = route?.upcoming ?? [];
  const next = route?.remaining[0] ?? null;

  return (
    <ScreenShell>
      <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ paddingBottom: 24 }}>
        <TopBar title="My visits" subtitle={`${doneN} of ${goal} done today`} right={<IconBtn icon="calendar" />} />
        {error ? <Text style={[styles.error, { marginHorizontal: 20 }]}>{error}</Text> : null}

        <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
          <View style={[styles.card, { padding: 18, marginBottom: 0 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
              <View style={{ width: 68, height: 68 }}>
                <Svg width={68} height={68} viewBox="0 0 68 68">
                  <Circle cx={34} cy={34} r={28} fill="none" stroke={colors.cream2} strokeWidth={6} />
                  <Circle
                    cx={34}
                    cy={34}
                    r={28}
                    fill="none"
                    stroke={colors.green}
                    strokeWidth={6}
                    strokeDasharray={`${2 * Math.PI * 28}`}
                    strokeDashoffset={`${2 * Math.PI * 28 * (1 - pct)}`}
                    strokeLinecap="round"
                    transform="rotate(-90 34 34)"
                  />
                </Svg>
                <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.ink }}>{Math.round(pct * 100)}%</Text>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.ink }}>
                  {leftToGoal === 0 ? `Target hit, ${firstName(who)}.` : `You're on track, ${firstName(who)}.`}
                </Text>
                <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 4, lineHeight: 18 }}>
                  {leftToGoal === 0
                    ? `${doneN} visits done against today's target of ${goal}.`
                    : `${leftToGoal} more visit${leftToGoal === 1 ? "" : "s"} to hit today's target of ${goal}.`}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: 20, paddingBottom: 12 }}>
          <FilterChip label={`Today ${todayN}`} active={tab === "today"} onPress={() => setTab("today")} />
          <FilterChip label={`Upcoming ${upcoming.length}`} active={tab === "upcoming"} onPress={() => setTab("upcoming")} />
          <FilterChip label={`Done ${doneN}`} active={tab === "done"} onPress={() => setTab("done")} />
        </View>

        <View style={{ paddingHorizontal: 16, gap: 8 }}>
          {tab === "today" ? (
            <>
              {todayN === 0 ? (
                <View style={[styles.card, { padding: 16 }]}>
                  <Text style={[styles.sub, { marginBottom: 0 }]}>No visits lined up today. A task with a site shows here.</Text>
                </View>
              ) : null}
              {route?.remaining.map((stop, index) => {
                const now = index === 0;
                return (
                  <VisitCard
                    key={stop.siteId}
                    now={now}
                    time={now ? "Now" : `${stop.km.toFixed(1)} km`}
                    name={stop.site}
                    sub={stop.tasks.map((task) => task.title).join(" · ") || "Site visit"}
                    dist={`${stop.km.toFixed(1)} km`}
                    status={now ? "busy" : "offline"}
                    onPress={() => {
                      const first = stop.tasks[0];
                      if (first) router.push(`/task/${first.id}`);
                      else router.push("/check-in");
                    }}
                  />
                );
              })}
              {next ? (
                <Pressable onPress={() => router.push("/check-in")} style={[styles.button, { marginTop: 8 }]}>
                  <Text style={styles.buttonText}>Check in at {next.site}</Text>
                </Pressable>
              ) : null}
            </>
          ) : null}

          {tab === "upcoming" ? (
            upcoming.length === 0 ? (
              <View style={[styles.card, { padding: 16 }]}>
                <Text style={[styles.sub, { marginBottom: 0 }]}>No visits booked after today.</Text>
              </View>
            ) : (
              upcoming.map((row) => (
                <VisitCard
                  key={row.id}
                  now={false}
                  time={row.dueOn ? row.dueOn.slice(5) : "Later"}
                  name={row.site ?? row.title}
                  sub={row.site ? row.title : "Task"}
                  dist="—"
                  status="offline"
                  onPress={() => router.push(`/task/${row.id}`)}
                />
              ))
            )
          ) : null}

          {tab === "done" ? (
            doneN === 0 ? (
              <View style={[styles.card, { padding: 16 }]}>
                <Text style={[styles.sub, { marginBottom: 0 }]}>No visits closed today.</Text>
              </View>
            ) : (
              route?.done.map((stop) => (
                <VisitCard
                  key={stop.id}
                  now={false}
                  time={clock(stop.checkedInAt)}
                  name={stop.site ?? "Field"}
                  sub={stop.late ? "Late check-in" : "Completed"}
                  dist={`${stop.km.toFixed(1)} km`}
                  status="available"
                />
              ))
            )
          ) : null}
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

function VisitCard({
  now,
  time,
  name,
  sub,
  dist,
  status,
  onPress,
}: {
  now: boolean;
  time: string;
  name: string;
  sub: string;
  dist: string;
  status: "available" | "busy" | "offline";
  onPress?: () => void;
}) {
  const dot = status === "available" ? colors.green : status === "busy" ? colors.amber : colors.ink4;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.card,
        {
          padding: 14,
          marginBottom: 0,
          borderLeftWidth: now ? 4 : 0,
          borderLeftColor: colors.amber,
          backgroundColor: now ? colors.amberSoft : colors.paper,
        },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <View style={{ paddingTop: 4 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot, shadowColor: dot, shadowOpacity: 0.35, shadowRadius: 4 }} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: colors.ink3 }}>{time}</Text>
            {now ? (
              <View style={{ backgroundColor: colors.amberSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ color: "#8A5A10", fontSize: 11, fontWeight: "700" }}>In progress</Text>
              </View>
            ) : null}
          </View>
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.ink, marginTop: 3 }}>{name}</Text>
          <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>{sub}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.ink }}>{dist}</Text>
          <Text style={{ fontSize: 10, color: colors.ink3, marginTop: 2 }}>away</Text>
        </View>
      </View>
    </Pressable>
  );
}
