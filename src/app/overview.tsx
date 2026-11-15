import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { router, useFocusEffect } from "expo-router";
import { api } from "@/api";
import { Avatar, IconBtn, ScreenShell, TopBar } from "@/chrome";
import { Icon, type IconName } from "@/icons";
import { loadSession, type Session } from "@/session";
import { colors, styles } from "@/theme";

type Person = { userId: string; person: string; site: string | null };
type Checkin = { person: string; phone: string; site: string | null; late: boolean };
type Site = { id: string; name: string; kind?: string; people?: number };
type Employee = { userId: string | null; status: string };
type Alert = { userId: string | null; status: string; message?: string };

function siteIcon(kind: string): IconName {
  const text = kind.toLowerCase();
  if (text.includes("sales") || text.includes("field") || text.includes("truck")) return "truck";
  if (text.includes("tech") || text.includes("service") || text.includes("hub")) return "briefcase";
  return "building";
}

function siteTone(kind: string, alerts: number) {
  if (alerts > 0) return colors.coral;
  const text = kind.toLowerCase();
  if (text.includes("sales") || text.includes("field")) return colors.amber;
  return colors.green;
}

function liveLine(fetchedAt: number, now: number) {
  const sec = Math.max(0, Math.round((now - fetchedAt) / 1000));
  if (!fetchedAt) return "Live";
  if (sec < 1) return "Live · just now";
  if (sec < 60) return `Live · updated ${sec}s ago`;
  const min = Math.round(sec / 60);
  return `Live · updated ${min} min ago`;
}

export default function Overview() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [onSite, setOnSite] = useState(0);
  const [field, setField] = useState(0);
  const [offline, setOffline] = useState(0);
  const [openAlerts, setOpenAlerts] = useState(0);
  const [present, setPresent] = useState(0);
  const [late, setLate] = useState(0);
  const [absent, setAbsent] = useState(0);
  const [sites, setSites] = useState<{ name: string; kind: string; people: number; alerts: number }[]>([]);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [hero, setHero] = useState({ w: 1, h: 140 });

  const refresh = useCallback(async () => {
    const current = await loadSession();
    if (!current) {
      router.replace("/login");
      return;
    }
    if (current.user.role === "employee") {
      router.replace("/check-in");
      return;
    }
    setSession(current);
    const [presence, attendance, alerts, roster, siteList] = await Promise.all([
      api<{ people: Person[] }>("/presence", {}, current.token),
      api<{ checkins: Checkin[] }>("/attendance", {}, current.token),
      api<{ alerts: Alert[] }>("/alerts", {}, current.token),
      api<{ employees: Employee[] }>("/employees", {}, current.token),
      api<{ sites: Site[] }>("/sites", {}, current.token),
    ]);
    const seen = new Set(presence.people.map((person) => person.userId));
    const active = roster.employees.filter((person) => person.status === "active" && person.userId);
    setOnSite(presence.people.filter((person) => person.site).length);
    setField(presence.people.filter((person) => !person.site).length);
    setOffline(active.filter((person) => person.userId && !seen.has(person.userId)).length);
    const open = alerts.alerts.filter((alert) => alert.status === "open" || alert.status === "escalated");
    setOpenAlerts(open.length);
    const checkedIn = new Set(attendance.checkins.map((row) => row.phone));
    const latePhones = new Set(attendance.checkins.filter((row) => row.late).map((row) => row.phone));
    setPresent(Math.max(checkedIn.size - latePhones.size, 0));
    setLate(latePhones.size);
    setAbsent(Math.max(active.length - checkedIn.size, 0));
    setSites(
      siteList.sites.map((site) => {
        const here = new Set(presence.people.filter((person) => person.site === site.name).map((person) => person.userId));
        const alertCount = open.filter(
          (alert) => (alert.userId && here.has(alert.userId)) || (alert.message ?? "").toLowerCase().includes(site.name.toLowerCase()),
        ).length;
        return {
          name: site.name,
          kind: site.kind?.trim() || "Site",
          people: site.people ?? here.size,
          alerts: alertCount,
        };
      }),
    );
    setFetchedAt(Date.now());
    setError("");
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
      const poll = setInterval(() => {
        refresh().catch(() => undefined);
      }, 15_000);
      return () => clearInterval(poll);
    }, [refresh]),
  );

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const total = present + late + absent;
  const presentFlex = total ? present : 0;
  const lateFlex = total ? late : 0;
  const absentFlex = total ? absent : 1;

  return (
    <ScreenShell>
      <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ paddingBottom: 24 }}>
        <TopBar
          title="Overview"
          subtitle={`${session?.workspace.name || "InField 7"} · ${sites.length} site${sites.length === 1 ? "" : "s"}`}
          left={<Avatar name={session?.user.name || "M"} size={38} />}
          right={
            <View style={{ flexDirection: "row", gap: 8 }}>
              <IconBtn icon="search" onPress={() => router.push("/team")} />
              <IconBtn icon="bell" tone="coral" onPress={() => router.push("/alerts")} />
            </View>
          }
        />
        <View style={{ paddingHorizontal: 20, paddingTop: 4, gap: 12 }}>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View
            style={{
              borderRadius: 20,
              overflow: "hidden",
              backgroundColor: colors.paper,
              shadowColor: "#000",
              shadowOpacity: 0.08,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 8 },
              elevation: 4,
            }}
          >
            <View
              onLayout={(event) => {
                const { width, height } = event.nativeEvent.layout;
                setHero((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
              }}
              style={{ padding: 18, overflow: "hidden" }}
            >
              <Svg width={hero.w} height={hero.h} style={{ position: "absolute", left: 0, top: 0 }}>
                <Defs>
                  <LinearGradient id="overviewHero" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor="#1C2430" />
                    <Stop offset="1" stopColor="#2C3350" />
                  </LinearGradient>
                </Defs>
                <Rect width="100%" height="100%" fill="url(#overviewHero)" />
              </Svg>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <PulseDot />
                <Text style={{ color: colors.paper, opacity: 0.7, fontSize: 11, fontWeight: "600", letterSpacing: 0.66, textTransform: "uppercase" }}>
                  {liveLine(fetchedAt, now)}
                </Text>
              </View>
              <View style={{ flexDirection: "row", marginTop: 14, gap: 8 }}>
                <Count value={onSite} label="On-site" color={colors.green} onPress={() => router.push({ pathname: "/map", params: { filter: "onsite" } })} />
                <Count value={field} label="Field" color={colors.amber} onPress={() => router.push({ pathname: "/map", params: { filter: "field" } })} />
                <Count value={offline} label="Offline" color="#B7BCC4" onPress={() => router.push({ pathname: "/map", params: { filter: "offline" } })} />
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14 }}>
              <Pressable onPress={() => router.push("/alerts")}>
                <Chip label={`${openAlerts} alert${openAlerts === 1 ? "" : "s"}`} tone="coral" />
              </Pressable>
              <Pressable onPress={() => router.push("/attendance")}>
                <Chip label={`${late} late`} tone="amber" />
              </Pressable>
              <Pressable onPress={() => router.push("/alerts")} style={{ flex: 1, alignItems: "flex-end" }}>
                <Icon name="chevronRight" size={16} color={colors.ink3} />
              </Pressable>
            </View>
          </View>

          <Pressable onPress={() => router.push("/attendance")} style={styles.card}>
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
              <Text style={{ fontWeight: "700", color: colors.ink, fontSize: 13 }}>Attendance today</Text>
              <Text style={{ color: colors.ink3, fontSize: 11, fontWeight: "500" }}>{total} total</Text>
            </View>
            <View style={{ flexDirection: "row", height: 12, borderRadius: 999, overflow: "hidden", marginTop: 12, backgroundColor: colors.cream }}>
              <View style={{ flex: presentFlex, backgroundColor: colors.green }} />
              <View style={{ flex: lateFlex, backgroundColor: colors.amber }} />
              <View style={{ flex: absentFlex, backgroundColor: colors.ink4 }} />
            </View>
            <View style={{ flexDirection: "row", gap: 14, marginTop: 12 }}>
              <LegendDot color={colors.green} label="Present" value={present} />
              <LegendDot color={colors.amber} label="Late" value={late} />
              <LegendDot color={colors.ink4} label="Absent" value={absent} />
            </View>
          </Pressable>

          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 4 }}>
            <Text style={{ fontWeight: "700", color: colors.ink, fontSize: 13 }}>Sites & teams</Text>
            <Pressable onPress={() => router.push("/team")}>
              <Text style={{ fontSize: 11, color: colors.greenDeep, fontWeight: "600" }}>See all →</Text>
            </Pressable>
          </View>
          {sites.length === 0 ? <Text style={styles.sub}>No sites yet. Add them on the website.</Text> : null}
          {sites.map((site) => {
            const tone = siteTone(site.kind, site.alerts);
            return (
              <Pressable
                key={site.name}
                onPress={() => router.push({ pathname: "/map", params: { q: site.name } })}
                style={[styles.card, { padding: 14 }]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      backgroundColor: `${tone}22`,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name={siteIcon(site.kind)} size={20} color={tone} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.ink }}>{site.name}</Text>
                    <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 1 }}>{site.kind}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontSize: 18, fontWeight: "700", color: colors.ink }}>{site.people}</Text>
                    {site.alerts > 0 ? (
                      <Text style={{ fontSize: 10, color: "#B03A2A", fontWeight: "600" }}>
                        {site.alerts} alert{site.alerts === 1 ? "" : "s"}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

function PulseDot() {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1600, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={{ width: 14, height: 14, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={{
          position: "absolute",
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: colors.green,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
        }}
      />
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green }} />
    </View>
  );
}

function Count({ value, label, color, onPress }: { value: number; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      <Text style={{ fontSize: 32, fontWeight: "700", color, letterSpacing: -1, lineHeight: 34 }}>{value}</Text>
      <Text style={{ color: colors.paper, opacity: 0.7, fontSize: 11, marginTop: 4, fontWeight: "500" }}>{label}</Text>
    </Pressable>
  );
}

function Chip({ label, tone }: { label: string; tone: "coral" | "amber" }) {
  const bg = tone === "coral" ? colors.coralSoft : colors.amberSoft;
  const fg = tone === "coral" ? "#A83A2C" : "#8A5A10";
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

function LegendDot({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ fontSize: 12, color: colors.ink }}>{label}</Text>
      <Text style={{ fontSize: 12, color: colors.ink3 }}>{value}</Text>
    </View>
  );
}
