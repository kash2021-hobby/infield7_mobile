import { useCallback, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { api } from "@/api";
import { Avatar, BackBtn, IconBtn, ScreenShell, TopBar } from "@/chrome";
import { loadSession } from "@/session";
import { colors, styles } from "@/theme";

type Progress = {
  person: { userId: string; name: string; phone: string; role: string; status: string | null; department: string | null };
  month: { from: string; to: string };
  attendance: { presentDays: number; late: number; checkins: number; hours: number };
  visits: { day: string; site: string | null; late: boolean; checkedInAt: string }[];
  tasks: { open: number; done: number; overdue: number; rows: { id: string; title: string; status: string; dueOn: string | null }[] };
};

function telHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  return `tel:+${digits.length === 10 ? "91" : ""}${digits}`;
}

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export default function PersonScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [tab, setTab] = useState<"visits" | "attendance" | "tasks">("visits");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const session = await loadSession();
    if (!session || !userId) return;
    setProgress(await api<Progress>(`/people/${userId}`, {}, session.token));
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  const call = progress ? telHref(progress.person.phone) : "";

  return (
    <ScreenShell>
    <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ paddingBottom: 24 }}>
      <TopBar
        title={progress?.person.name ?? "Person"}
        subtitle={progress ? [progress.person.role, progress.person.department].filter(Boolean).join(" · ") : "This month"}
        left={<BackBtn />}
        right={call ? <IconBtn icon="phone" tone="green" onPress={() => void Linking.openURL(call)} /> : undefined}
      />
      <View style={{ paddingHorizontal: 20, gap: 12 }}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {progress ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <Avatar name={progress.person.name} size={56} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: colors.ink }}>{progress.person.name}</Text>
                <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>
                  {progress.month.from} – {progress.month.to}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {(["visits", "attendance", "tasks"] as const).map((id) => (
                <Pressable
                  key={id}
                  onPress={() => setTab(id)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 999,
                    backgroundColor: tab === id ? colors.ink : colors.paper,
                    borderWidth: 1,
                    borderColor: tab === id ? colors.ink : colors.cream2,
                  }}
                >
                    <Text style={{ color: tab === id ? colors.paper : colors.ink3, fontSize: 12, fontWeight: "600" }}>
                    {id === "visits" ? "Visits" : id === "attendance" ? "Attendance" : "Tasks"}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={{ fontSize: 11, color: colors.ink3 }}>Sales — off this product</Text>

            {tab === "attendance" ? (
              <View style={styles.card}>
                {[
                  ["Present days", String(progress.attendance.presentDays)],
                  ["Check-ins", String(progress.attendance.checkins)],
                  ["Hours", String(progress.attendance.hours)],
                  ["Late", String(progress.attendance.late)],
                ].map(([label, value]) => (
                  <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.cream2 }}>
                    <Text style={{ fontSize: 13, color: colors.ink3 }}>{label}</Text>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink }}>{value}</Text>
                  </View>
                ))}
              </View>
            ) : tab === "tasks" ? (
              <View style={styles.card}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink, marginBottom: 10 }}>
                  Open {progress.tasks.open} · Done {progress.tasks.done} · Overdue {progress.tasks.overdue}
                </Text>
                {progress.tasks.rows.map((task) => (
                  <Pressable key={task.id} onPress={() => router.push(`/task/${task.id}`)} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.cream2 }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.ink }}>{task.title}</Text>
                    <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>{task.dueOn ?? task.status.replace("_", " ")}</Text>
                  </Pressable>
                ))}
                {progress.tasks.rows.length === 0 ? <Text style={[styles.sub, { marginBottom: 0 }]}>No tasks this month.</Text> : null}
              </View>
            ) : (
              <View style={styles.card}>
                {progress.visits.map((row, index) => (
                  <View key={`${row.checkedInAt}-${index}`} style={{ paddingVertical: 8, borderTopWidth: index ? 1 : 0, borderTopColor: colors.cream2 }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.ink }}>{row.site ?? "Check-in"}</Text>
                    <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>
                      {row.day}{row.late ? " · late" : ""} · {clock(row.checkedInAt)}
                    </Text>
                  </View>
                ))}
                {progress.visits.length === 0 ? <Text style={[styles.sub, { marginBottom: 0 }]}>No check-ins this month.</Text> : null}
              </View>
            )}
          </>
        ) : (
          <Text style={styles.sub}>Loading…</Text>
        )}
      </View>
    </ScrollView>
    </ScreenShell>
  );
}
