import { useCallback, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { api } from "@/api";
import { Avatar, BackBtn, IconBtn, ScreenShell, TopBar } from "@/chrome";
import { Icon } from "@/icons";
import { shareAttendancePdf } from "@/reportPdf";
import { loadSession } from "@/session";
import { colors, styles } from "@/theme";

type Row = { day: string; person: string; phone: string; site: string | null; late: boolean; checkedInAt: string };
type Report = { from: string; to: string; totals: { people: number; checkins: number; late: number }; rows: Row[] };
type Checkin = {
  id?: string;
  person: string;
  phone: string;
  site: string | null;
  late: boolean;
  checkedInAt?: string;
  checked_in_at?: string;
  checked_out_at?: string | null;
};
type Employee = { phone: string; status: string; site: string | null };
type Site = { id: string; name: string };
type Flag = { id: string; label: string };
type Review = { id: string; person: string; phone: string; site: string | null; flags: Flag[]; checkedInAt: string };

const labels = ["S", "M", "T", "W", "T", "F", "S"];

function isDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function daysBetween(from: string, to: string) {
  if (!isDay(from) || !isDay(to) || from > to) return [];
  const list: string[] = [];
  let current = from;
  let guard = 0;
  while (current <= to && guard < 370) {
    list.push(current);
    const next = shiftDay(current, 1);
    if (!next || next <= current) break;
    current = next;
    guard += 1;
  }
  return list;
}

function shiftDay(day: string, days: number) {
  if (!isDay(day)) return "";
  const [year, month, date] = day.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, (date ?? 1) + days));
  if (Number.isNaN(next.getTime())) return "";
  return next.toISOString().slice(0, 10);
}

function formatRange(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const month = end.toLocaleDateString("en-IN", { month: "short" });
  return `${start.getDate()} – ${end.getDate()} ${month}`;
}

function weekday(day: string) {
  return labels[new Date(`${day}T00:00:00`).getDay()];
}

function rate(rows: Row[], roster: number, from: string, to: string) {
  if (!roster || !isDay(from) || !isDay(to)) return 0;
  const span = daysBetween(from, to);
  const present = new Set(rows.map((row) => `${row.day}:${row.phone}`)).size;
  return Math.round((present / (roster * span.length)) * 100);
}

function telHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  return `tel:+${digits.length === 10 ? "91" : ""}${digits}`;
}

export default function Attendance() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [today, setToday] = useState<Checkin[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [previous, setPrevious] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

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
    const [report, attendance, people, siteList, pending] = await Promise.all([
      api<Report>("/reports/attendance", {}, session.token),
      api<{ checkins: Checkin[] }>("/attendance", {}, session.token),
      api<{ employees: Employee[] }>("/employees", {}, session.token),
      api<{ sites: Site[] }>("/sites", {}, session.token),
      api<{ checkins: Review[] }>("/check-ins/review?status=pending", {}, session.token).catch(() => ({ checkins: [] as Review[] })),
    ]);
    const active = people.employees.filter((person) => person.status === "active");
    setFrom(report.from);
    setTo(report.to);
    setRows(report.rows);
    setToday(attendance.checkins);
    setSites(siteList.sites);
    setEmployees(active);
    setReviews(pending.checkins);
    const priorFrom = shiftDay(report.from, -7);
    const priorTo = shiftDay(report.to, -7);
    const prior = await api<Report>(`/reports/attendance?from=${priorFrom}&to=${priorTo}`, {}, session.token);
    setPrevious(prior.rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  const roster = employees.length;
  const week = useMemo(() => {
    if (!from || !to) return [];
    return daysBetween(from, to).map((day) => ({
      day,
      label: weekday(day),
      count: new Set(rows.filter((row) => row.day === day).map((row) => row.phone)).size,
    }));
  }, [from, to, rows]);

  const maxBar = Math.max(roster, ...week.map((day) => day.count), 1);
  const weekly = rate(rows, roster, from, to);
  const lastWeek = isDay(from) && isDay(to) ? rate(previous, roster, shiftDay(from, -7), shiftDay(to, -7)) : 0;
  const delta = weekly - lastWeek;
  const todayKey = to;
  const bySite = sites.map((site) => {
    const assigned = employees.filter((person) => person.site === site.name);
    const total = assigned.length || roster;
    const present = new Set(today.filter((row) => row.site === site.name).map((row) => row.phone)).size;
    return { name: site.name, present, total };
  }).filter((site) => site.total > 0 || today.some((row) => row.site === site.name));
  const recent = showAll ? today : today.slice(0, 8);

  function when(row: Checkin) {
    const stamp = row.checkedInAt ?? row.checked_in_at;
    if (!stamp) return "";
    return new Date(stamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }

  async function decide(id: string, decision: "approve" | "reject") {
    const session = await loadSession();
    if (!session) return;
    if (decision === "reject" && !(notes[id] ?? "").trim()) {
      setError("Add a reason before rejecting");
      return;
    }
    setActing(id);
    setError("");
    setNotice("");
    try {
      await api(`/check-ins/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ decision, note: notes[id] || undefined }),
      }, session.token);
      setNotice(decision === "approve" ? "Attendance updated. This check-in now counts." : "Check-in left out of attendance.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setActing(null);
    }
  }

  return (
    <ScreenShell>
    <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <TopBar
        title="Attendance"
        subtitle={from && to ? `Week of ${formatRange(from, to)}` : "This week"}
        left={<BackBtn />}
        right={<IconBtn icon="calendar" onPress={() => undefined} />}
      />
      <View style={{ paddingHorizontal: 20, paddingTop: 4, gap: 12 }}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={{ color: colors.greenDeep, fontWeight: "600", marginBottom: 4 }}>{notice}</Text> : null}

      <Pressable
        disabled={busy || !from || !to}
        onPress={async () => {
          const session = await loadSession();
          if (!session) return;
          setBusy(true);
          setError("");
          try {
            await shareAttendancePdf(session.token, from, to);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not make the PDF");
          } finally {
            setBusy(false);
          }
        }}
        style={[styles.button, styles.secondary, { marginBottom: 0 }]}
      >
        <Text style={[styles.buttonText, styles.secondaryText]}>{busy ? "Making PDF" : "Share this week as PDF"}</Text>
      </Pressable>

      <View style={styles.card}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
          <Text style={{ fontSize: 44, fontWeight: "700", color: colors.ink, letterSpacing: -1, lineHeight: 48 }}>{weekly}%</Text>
          <View style={{ paddingBottom: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.ink }}>Weekly attendance</Text>
            <Text style={{ fontSize: 11, fontWeight: "600", color: delta >= 0 ? colors.greenDeep : colors.coral, marginTop: 2 }}>
              {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}% vs last week
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, height: 100, marginTop: 18 }}>
          {week.map((day) => (
            <View key={day.day} style={{ flex: 1, alignItems: "center", gap: 6 }}>
              <View
                style={{
                  width: "100%",
                  height: Math.max((day.count / maxBar) * 80, day.count ? 6 : 2),
                  borderRadius: 6,
                  backgroundColor: day.day === todayKey ? colors.green : colors.greenSoft,
                }}
              />
              <Text style={{ fontSize: 10, color: colors.ink3, fontWeight: "600" }}>{day.label}</Text>
            </View>
          ))}
        </View>
        <Text style={[styles.sub, { marginTop: 12, marginBottom: 0 }]}>
          {rows.length} check-ins · {new Set(rows.map((row) => row.phone)).size} people · {rows.filter((row) => row.late).length} late
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink, marginBottom: 12 }}>By site — today</Text>
        {bySite.length === 0 ? <Text style={[styles.sub, { marginBottom: 0 }]}>No sites yet.</Text> : null}
        {bySite.map((site) => {
          const share = site.total ? site.present / site.total : 0;
          const tone = share > 0.9 ? colors.green : share > 0.7 ? colors.amber : colors.coral;
          return (
            <View key={site.name} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: "500", color: colors.ink, flex: 1 }}>{site.name}</Text>
                <Text style={{ fontSize: 12, color: colors.ink3 }}>{site.present}/{site.total}</Text>
              </View>
              <View style={{ height: 6, borderRadius: 999, backgroundColor: colors.cream, overflow: "hidden" }}>
                <View style={{ height: "100%", width: `${Math.round(share * 100)}%`, backgroundColor: tone }} />
              </View>
            </View>
          );
        })}
      </View>

      {reviews.length > 0 ? (
        <View style={[styles.card, { maxHeight: 280, paddingBottom: 0 }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink }}>Regularization</Text>
            <Text style={{ fontSize: 11, color: colors.ink3 }}>{reviews.length}</Text>
          </View>
          <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }}>
          {reviews.map((item) => (
            <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: colors.cream2, paddingTop: 12, marginTop: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.ink }}>{item.person}</Text>
              <Text style={[styles.sub, { marginBottom: 8 }]}>
                {item.site ?? "Unknown site"} · {new Date(item.checkedInAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                {item.flags.length ? ` · ${item.flags.map((flag) => flag.label).join(", ")}` : ""}
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Reason (required to reject)"
                placeholderTextColor={colors.ink3}
                value={notes[item.id] ?? ""}
                onChangeText={(text) => setNotes((current) => ({ ...current, [item.id]: text }))}
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable style={[styles.button, { flex: 1, marginTop: 0 }]} disabled={acting === item.id} onPress={() => void decide(item.id, "approve")}>
                  <Text style={styles.buttonText}>Approve</Text>
                </Pressable>
                <Pressable style={[styles.button, styles.secondary, { flex: 1, marginTop: 0 }]} disabled={acting === item.id} onPress={() => void decide(item.id, "reject")}>
                  <Text style={[styles.buttonText, styles.secondaryText]}>Reject</Text>
                </Pressable>
                {telHref(item.phone) ? (
                  <Pressable
                    style={[styles.button, styles.secondary, { marginTop: 0, paddingHorizontal: 14 }]}
                    onPress={() => void Linking.openURL(telHref(item.phone))}
                  >
                    <Icon name="phone" size={16} color={colors.ink} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={[styles.card, { padding: 0, overflow: "hidden" }]}>
        <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink }}>Recent check-ins</Text>
          {today.length > 8 ? (
            <Pressable onPress={() => setShowAll((open) => !open)}>
              <Text style={{ fontSize: 11, color: colors.greenDeep, fontWeight: "600" }}>{showAll ? "Show less" : "See all"}</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => router.push("/review")}>
              <Text style={{ fontSize: 11, color: colors.greenDeep, fontWeight: "600" }}>See all</Text>
            </Pressable>
          )}
        </View>
        {recent.length === 0 ? <Text style={[styles.sub, { paddingHorizontal: 16, paddingBottom: 14 }]}>Nobody has checked in today.</Text> : null}
        {recent.map((row) => {
          const stamp = when(row);
          const tone = row.late ? colors.coral : row.checked_out_at ? colors.ink3 : colors.green;
          return (
            <View key={`${row.phone}-${stamp}`} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.cream2 }}>
              <Avatar name={row.person} size={32} />
              <Text style={{ flex: 1, fontSize: 13, fontWeight: "500", color: colors.ink }}>{row.person}</Text>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone }} />
              <Text style={{ fontSize: 12, color: colors.ink3 }}>{stamp}</Text>
            </View>
          );
        })}
      </View>
      </View>
    </ScrollView>
    </ScreenShell>
  );
}
