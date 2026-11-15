import { useCallback, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { api } from "@/api";
import { Avatar, FilterChip, IconBtn, ScreenShell, TopBar } from "@/chrome";
import { loadSession } from "@/session";
import { colors, styles } from "@/theme";

type Employee = {
  userId: string | null;
  name: string;
  phone: string;
  role: string;
  status: string;
  department: string | null;
  site: string | null;
  jobTitle: string | null;
};
type Person = { userId: string; site: string | null; recordedAt: string };
type Checkin = { phone: string };
type Alert = { userId: string | null; status: string };
type Leave = { userId?: string; status: string; startDate: string; endDate: string };

type Place = "available" | "field" | "alert" | "offline";

const dot: Record<Place, string> = {
  available: colors.green,
  field: colors.amber,
  alert: colors.coral,
  offline: colors.ink4,
};

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function telHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  return `tel:+${digits.length === 10 ? "91" : ""}${digits}`;
}

export default function Team() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [presence, setPresence] = useState<Person[]>([]);
  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set());
  const [alertUsers, setAlertUsers] = useState<Set<string>>(new Set());
  const [onLeave, setOnLeave] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [tab, setTab] = useState<"all" | Place | "in" | "leave" | "off">("all");
  const [error, setError] = useState("");

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
    const [roster, live, attendance, alerts, leave] = await Promise.all([
      api<{ employees: Employee[] }>("/employees", {}, session.token),
      api<{ people: Person[] }>("/presence", {}, session.token),
      api<{ checkins: Checkin[] }>("/attendance", {}, session.token),
      api<{ alerts: Alert[] }>("/alerts", {}, session.token),
      api<{ requests: Leave[] }>("/leave", {}, session.token).catch(() => ({ requests: [] as Leave[] })),
    ]);
    const today = todayIst();
    setEmployees(roster.employees.filter((person) => person.status === "active"));
    setPresence(live.people);
    setCheckedIn(new Set(attendance.checkins.map((row) => row.phone)));
    setAlertUsers(new Set(alerts.alerts.filter((alert) => alert.userId && (alert.status === "open" || alert.status === "escalated")).map((alert) => alert.userId as string)));
    setOnLeave(new Set(
      leave.requests
        .filter((row) => row.status === "approved" && row.userId && row.startDate <= today && row.endDate >= today)
        .map((row) => row.userId as string),
    ));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  const rows = useMemo(() => {
    const byUser = new Map(presence.map((person) => [person.userId, person]));
    return employees.map((person) => {
      const live = person.userId ? byUser.get(person.userId) : undefined;
      const leave = Boolean(person.userId && onLeave.has(person.userId));
      const place: Place = person.userId && alertUsers.has(person.userId)
        ? "alert"
        : leave
          ? "offline"
          : live?.site
            ? "available"
            : live
              ? "field"
              : "offline";
      const where = place === "alert"
        ? "Outside area"
        : leave
          ? "On leave"
          : place === "available"
            ? live?.site ?? "On-site"
            : place === "field"
              ? "Field"
              : checkedIn.has(person.phone)
                ? "Offline"
                : "Off";
      const line = [person.jobTitle || person.role, person.department, person.site].filter(Boolean).join(" · ");
      return { ...person, place, where, line, leave };
    });
  }, [employees, presence, alertUsers, onLeave, checkedIn]);

  const needle = query.trim().toLowerCase();
  const visible = rows.filter((person) => {
    if (tab === "in" && !checkedIn.has(person.phone)) return false;
    if (tab === "leave" && !person.leave) return false;
    if (tab === "off" && (checkedIn.has(person.phone) || person.leave)) return false;
    if (tab !== "all" && tab !== "in" && tab !== "leave" && tab !== "off" && person.place !== tab) return false;
    if (!needle) return true;
    return person.name.toLowerCase().includes(needle) || person.phone.includes(needle) || person.line.toLowerCase().includes(needle);
  });

  const counts = {
    all: rows.length,
    available: rows.filter((person) => person.place === "available").length,
    field: rows.filter((person) => person.place === "field").length,
    alert: rows.filter((person) => person.place === "alert").length,
    in: rows.filter((person) => checkedIn.has(person.phone)).length,
    leave: rows.filter((person) => person.leave).length,
    off: rows.filter((person) => !checkedIn.has(person.phone) && !person.leave).length,
  };

  return (
    <ScreenShell>
    <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <TopBar
        title="Team"
        subtitle={`${counts.all} employee${counts.all === 1 ? "" : "s"} · ${counts.in} checked in`}
        right={
          <View style={{ flexDirection: "row", gap: 8 }}>
            <IconBtn icon="search" onPress={() => setSearching((open) => !open)} />
            <IconBtn icon="filter" onPress={() => setFilterOpen((open) => !open)} />
          </View>
        }
      />
      {searching ? (
        <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search name or phone"
            placeholderTextColor={colors.ink3}
            style={[styles.input, { marginBottom: 0 }]}
            autoFocus
          />
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 20, paddingBottom: 12 }}>
        <FilterChip label={`All ${counts.all}`} active={tab === "all"} onPress={() => setTab("all")} />
        <FilterChip label={`Available ${counts.available}`} active={tab === "available"} onPress={() => setTab("available")} />
        <FilterChip label={`Field ${counts.field}`} active={tab === "field"} onPress={() => setTab("field")} />
        <FilterChip label={`Alerts ${counts.alert}`} active={tab === "alert"} onPress={() => setTab("alert")} />
      </ScrollView>
      {filterOpen ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 20, paddingBottom: 12 }}>
          <FilterChip label={`In ${counts.in}`} active={tab === "in"} onPress={() => setTab("in")} />
          <FilterChip label={`Leave ${counts.leave}`} active={tab === "leave"} onPress={() => setTab("leave")} />
          <FilterChip label={`Off ${counts.off}`} active={tab === "off"} onPress={() => setTab("off")} />
        </ScrollView>
      ) : null}
      <View style={{ paddingHorizontal: 16, gap: 8 }}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {visible.length === 0 ? <Text style={styles.sub}>No one in this list.</Text> : null}
        {visible.map((person) => {
          const call = telHref(person.phone);
          return (
            <Pressable
              key={person.userId ?? person.phone}
              onPress={() => {
                if (person.userId) router.push(`/person/${person.userId}`);
              }}
              style={{ backgroundColor: colors.paper, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: colors.cream2 }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View>
                  <Avatar name={person.name} size={44} />
                  <View style={{
                    position: "absolute",
                    right: -2,
                    bottom: -2,
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: dot[person.place],
                    borderWidth: 2,
                    borderColor: colors.paper,
                  }} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.ink }}>{person.name}</Text>
                  <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }} numberOfLines={1}>{person.line || person.role}</Text>
                </View>
                <View style={{ alignItems: "flex-end", maxWidth: 110 }}>
                  <Text style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: person.place === "alert" ? colors.coral : person.place === "offline" ? colors.ink3 : colors.ink,
                  }}>{person.where}</Text>
                  <Text style={{ fontSize: 10, color: colors.ink3, marginTop: 2, textTransform: "capitalize" }}>{person.place}</Text>
                </View>
              </View>
              {call ? (
                <Pressable
                  onPress={() => void Linking.openURL(call)}
                  style={{ marginTop: 10, alignSelf: "flex-end", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.cream }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "600", color: colors.ink }}>Call</Text>
                </Pressable>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
    </ScreenShell>
  );
}
