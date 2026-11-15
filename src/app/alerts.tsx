import { useCallback, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { api } from "@/api";
import { FilterChip, IconBtn, ScreenShell, TopBar } from "@/chrome";
import { Icon, type IconName } from "@/icons";
import { loadSession, type Session } from "@/session";
import { colors, styles } from "@/theme";

type Alert = {
  id: string;
  kind: string;
  message: string;
  status: string;
  createdAt: string;
  person: string | null;
  phone?: string | null;
};

const clock = /^\d{2}:\d{2}$/;

type Tone = "critical" | "warn" | "info";

function toneOf(kind: string): Tone {
  if (kind === "sos" || kind === "geofence_exit") return "critical";
  if (kind === "late_checkin" || kind === "task_delay") return "warn";
  return "info";
}

function titleOf(kind: string, message: string) {
  if (kind === "sos") return "SOS";
  if (kind === "geofence_exit") return "Employee outside work radius";
  if (kind === "late_checkin") return "Late check-in";
  if (kind === "task_delay") return "Task delay";
  return message;
}

function ago(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

function dayLabel(iso: string) {
  const day = new Date(iso);
  const today = new Date();
  const same = day.toDateString() === today.toDateString();
  if (same) return "Today";
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (day.toDateString() === y.toDateString()) return "Yesterday";
  return day.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function telHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  return `tel:+${digits.length === 10 ? "91" : ""}${digits}`;
}

export default function AlertsScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [start, setStart] = useState("22:00");
  const [end, setEnd] = useState("07:00");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"all" | Tone>("all");
  const [settings, setSettings] = useState(false);

  const refresh = useCallback(async (current?: Session) => {
    const sessionNow = current ?? (await loadSession());
    if (!sessionNow) return;
    setSession(sessionNow);
    const body = await api<{ alerts: Alert[]; quietHours: { startTime: string; endTime: string } }>(
      "/alerts",
      {},
      sessionNow.token,
    );
    setAlerts(body.alerts);
    setStart(body.quietHours.startTime.slice(0, 5));
    setEnd(body.quietHours.endTime.slice(0, 5));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  async function acknowledge(id: string) {
    if (!session) return;
    setError("");
    try {
      await api(`/alerts/${id}/acknowledge`, { method: "POST", body: "{}" }, session.token);
      await refresh(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not acknowledge");
    }
  }

  async function saveHours() {
    if (!session) return;
    if (!clock.test(start) || !clock.test(end)) {
      setError("Use times like 22:00");
      return;
    }
    setError("");
    setNotice("");
    try {
      await api("/quiet-hours", { method: "POST", body: JSON.stringify({ startTime: start, endTime: end }) }, session.token);
      setNotice("Quiet hours saved. Late check-ins and fence exits wait. SOS still comes through.");
      await refresh(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  }

  const unread = alerts.filter((alert) => alert.status === "open" || alert.status === "escalated").length;
  const counts = useMemo(() => {
    const list = alerts.map((alert) => ({ ...alert, tone: toneOf(alert.kind) }));
    const rows = tab === "all" ? list : list.filter((row) => row.tone === tab);
    const groups: { label: string; rows: typeof rows }[] = [];
    for (const row of rows) {
      const label = dayLabel(row.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.rows.push(row);
      else groups.push({ label, rows: [row] });
    }
    return {
      all: list.length,
      critical: list.filter((row) => row.tone === "critical").length,
      warn: list.filter((row) => row.tone === "warn").length,
      info: list.filter((row) => row.tone === "info").length,
      groups,
    };
  }, [alerts, tab]);

  return (
    <ScreenShell>
    <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <TopBar
        title="Alerts"
        subtitle={`${unread} unread · today`}
        right={<IconBtn icon="settings" onPress={() => setSettings((open) => !open)} />}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 20, paddingBottom: 12 }}>
        <FilterChip label="All" active={tab === "all"} onPress={() => setTab("all")} />
        <FilterChip label={`Critical ${counts.critical}`} active={tab === "critical"} onPress={() => setTab("critical")} />
        <FilterChip label={`Warnings ${counts.warn}`} active={tab === "warn"} onPress={() => setTab("warn")} />
        <FilterChip label="Info" active={tab === "info"} onPress={() => setTab("info")} />
      </ScrollView>
      <View style={{ paddingHorizontal: 16 }}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {settings ? (
        <View style={[styles.card, { marginBottom: 12 }]}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink, marginBottom: 8 }}>Quiet hours</Text>
          <Text style={[styles.sub, { marginBottom: 8 }]}>Late check-in and leaving a site stay quiet overnight. An SOS still comes through.</Text>
          <Text style={styles.label}>Quiet from</Text>
          <TextInput style={styles.input} value={start} onChangeText={setStart} placeholder="22:00" placeholderTextColor={colors.ink3} />
          <Text style={styles.label}>Until</Text>
          <TextInput style={styles.input} value={end} onChangeText={setEnd} placeholder="07:00" placeholderTextColor={colors.ink3} />
          <Pressable style={[styles.button, styles.secondary]} onPress={saveHours}>
            <Text style={[styles.buttonText, styles.secondaryText]}>Save quiet hours</Text>
          </Pressable>
        </View>
      ) : null}
      {counts.groups.length === 0 ? <Text style={styles.sub}>No alerts yet.</Text> : null}
      {counts.groups.map((group) => (
        <View key={group.label} style={{ marginBottom: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.6, color: colors.ink3, marginBottom: 8, textTransform: "uppercase" }}>
            {group.label}
          </Text>
          {group.rows.map((alert) => {
            const isCrit = alert.tone === "critical";
            const isWarn = alert.tone === "warn";
            const bg = isCrit ? colors.coralSoft : isWarn ? colors.amberSoft : colors.paper;
            const bar = isCrit ? colors.coral : isWarn ? colors.amber : colors.ink4;
            const icon: IconName = isCrit ? "alert" : isWarn ? "clock" : "check";
            const call = telHref(alert.phone ?? "");
            const open = alert.status !== "acknowledged";
            const sub = [alert.person, alert.message].filter(Boolean).join(" · ");
            return (
              <View
                key={alert.id}
                style={{
                  backgroundColor: bg,
                  borderRadius: 16,
                  padding: 14,
                  flexDirection: "row",
                  gap: 12,
                  alignItems: "flex-start",
                  borderWidth: 1,
                  borderColor: isCrit ? "#D4533E55" : isWarn ? "#E2B04355" : colors.cream2,
                  marginBottom: 8,
                }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${bar}33`, alignItems: "center", justifyContent: "center" }}>
                  <Icon name={icon} size={18} color={bar} />
                </View>
                <Pressable style={{ flex: 1 }} onPress={() => { if (open) void acknowledge(alert.id); }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink }}>{titleOf(alert.kind, alert.message)}</Text>
                  <Text style={{ fontSize: 11, color: colors.ink2, marginTop: 3, lineHeight: 16 }}>{sub}</Text>
                  <Text style={{ fontSize: 10, color: colors.ink3, marginTop: 6 }}>{ago(alert.createdAt)}</Text>
                </Pressable>
                {isCrit && call ? (
                  <Pressable
                    onPress={() => void Linking.openURL(call)}
                    style={{ backgroundColor: colors.ink, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}
                  >
                    <Text style={{ color: colors.paper, fontSize: 11, fontWeight: "600" }}>Call</Text>
                  </Pressable>
                ) : open && !isCrit ? (
                  <Pressable onPress={() => acknowledge(alert.id)} style={{ paddingHorizontal: 6, paddingVertical: 6 }}>
                    <Text style={{ color: colors.ink3, fontSize: 11, fontWeight: "600" }}>Ack</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
      </View>
    </ScrollView>
    </ScreenShell>
  );
}
