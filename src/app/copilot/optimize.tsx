import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, type Href } from "expo-router";
import { api } from "@/api";
import { Avatar, BackBtn, ScreenShell, TopBar } from "@/chrome";
import { AIMark, Chip } from "@/copilot-ui";
import { Icon } from "@/icons";
import { loadSession } from "@/session";
import { colors, styles } from "@/theme";

type Employee = { userId: string | null; name: string; status: string };
type Task = { id: string; status: string; assigneeUserId?: string | null; assignee?: string | null };

export default function ResourceOptimization() {
  const [people, setPeople] = useState<{ name: string; now: string }[]>([]);
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
    const [roster, taskList] = await Promise.all([
      api<{ employees: Employee[] }>("/employees", {}, session.token),
      api<{ tasks: Task[] }>("/tasks", {}, session.token),
    ]);
    const open = taskList.tasks.filter((task) => task.status !== "done");
    const rows = roster.employees
      .filter((person) => person.status === "active")
      .slice(0, 5)
      .map((person) => {
        const n = open.filter((task) => task.assigneeUserId === person.userId || task.assignee === person.name).length;
        return { name: person.name, now: `${n} open task${n === 1 ? "" : "s"}` };
      });
    setPeople(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setError("");
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  return (
    <ScreenShell>
      <TopBar title="Reshuffle for tomorrow" subtitle="AI-suggested allocation" left={<BackBtn />} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
        <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          <View style={styles.card}>
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: colors.greenSoft, alignItems: "center", justifyContent: "center" }}>
                <AIMark size={20} color={colors.greenDeep} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink }}>Hours saved across the team</Text>
                <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>Off this product — no invented travel or load scores</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
              {[
                ["Travel", "Off"],
                ["Load balance", "Off"],
                ["Fairness", "Off"],
              ].map(([label, value]) => (
                <View key={label} style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: colors.cream }}>
                  <Text style={{ fontSize: 9, color: colors.ink3, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase" }}>{label}</Text>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.ink3, marginTop: 3 }}>{value}</Text>
                </View>
              ))}
            </View>
            <Text style={{ fontSize: 10, color: colors.ink3, marginTop: 10, lineHeight: 15 }}>
              Current open-task counts are live. Suggested km, hours, and write-back stay off.
            </Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 20, paddingBottom: 6 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: colors.ink3 }}>
            Current → Suggested
          </Text>
        </View>

        <View style={{ paddingHorizontal: 16, gap: 8 }}>
          {people.length === 0 ? <Text style={styles.sub}>No active people to show.</Text> : null}
          {people.map((row) => (
            <View key={row.name} style={[styles.card, { marginBottom: 0 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Avatar name={row.name} size={32} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.ink }}>{row.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <Text style={{ fontSize: 10, color: colors.ink3 }}>{row.now}</Text>
                    <Icon name="chevronRight" size={11} color={colors.ink3} />
                    <Text style={{ fontSize: 10, fontWeight: "600", color: colors.ink3 }}>Off this product</Text>
                  </View>
                </View>
                <Chip tone="green">no write-back</Chip>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.paper, borderTopWidth: 1, borderTopColor: colors.cream2, flexDirection: "row", gap: 8 }}>
        <Pressable onPress={() => router.back()} style={[styles.button, styles.secondary, { flex: 0, marginTop: 0, paddingHorizontal: 14 }]}>
          <Text style={[styles.buttonText, styles.secondaryText, { fontSize: 13 }]}>Dismiss</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/tasks" as Href)} style={[styles.button, styles.secondary, { flex: 0, marginTop: 0, paddingHorizontal: 14 }]}>
          <Text style={[styles.buttonText, styles.secondaryText, { fontSize: 13 }]}>Review each</Text>
        </Pressable>
        <Pressable
          onPress={() => setNotice("Apply all stays off. Accept a brief suggestion to create one normal task.")}
          style={[styles.greenButton, { flex: 1, marginTop: 0, paddingVertical: 12, borderRadius: 12, flexDirection: "row", justifyContent: "center", gap: 6 }]}
        >
          <Icon name="check" size={16} color={colors.paper} />
          <Text style={{ color: colors.paper, fontSize: 14, fontWeight: "600" }}>Apply all</Text>
        </Pressable>
      </View>
    </ScreenShell>
  );
}
