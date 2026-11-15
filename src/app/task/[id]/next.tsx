import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { api } from "@/api";
import { ScreenShell } from "@/chrome";
import { Icon, type IconName } from "@/icons";
import { loadSession } from "@/session";
import { colors, styles } from "@/theme";
import type { TaskDetail } from "@/taskDetail";

export default function NextStep() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const session = await loadSession();
        if (!session || !id) return;
        setUserId(session.user.id);
        setRole(session.user.role);
        setTask(await api<TaskDetail>(`/tasks/${id}`, {}, session.token));
      })().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [id]),
  );

  const nextId = task?.nextId ?? task?.steps.find((step) => step.status !== "done" && step.id && step.id !== id)?.id ?? null;
  const next = task?.steps.find((step) => step.id === nextId) ?? task?.steps.find((step) => step.status !== "done" && step.id !== id);
  const canOpen = next && (role !== "employee" || !next.assigneeUserId || next.assigneeUserId === userId);

  async function pushNext() {
    if (!next?.id) {
      router.replace("/tasks");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (canOpen && next.status === "new") {
        const session = await loadSession();
        if (session) {
          await api(`/tasks/${next.id}`, { method: "POST", body: JSON.stringify({ status: "in_progress" }) }, session.token);
        }
      }
      if (canOpen) router.replace(`/task/${next.id}`);
      else router.replace("/tasks");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the next task");
    } finally {
      setBusy(false);
    }
  }

  const rows: { label: string; value: string; sub: string; icon: IconName }[] = next
    ? [
        { label: "Assign to", value: next.assignee ?? "Unassigned", sub: task?.workflowName ?? "Next person in the chain", icon: "user" },
        { label: "Due by", value: task?.dueOn ? task.dueOn.slice(0, 10) : "When they accept", sub: "Follows this workflow", icon: "clock" },
        { label: "Notify on complete", value: task?.alertGoesTo?.name ?? "Your manager", sub: task?.alertGoesTo?.role ?? "Ops", icon: "bell" },
      ]
    : [];

  return (
    <ScreenShell>
      <View style={{ flex: 1, backgroundColor: colors.cream }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24, backgroundColor: colors.greenSoft }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" }}>
              <Icon name="check" size={20} color={colors.paper} />
            </View>
            <View>
              <Text style={{ fontSize: 18, fontWeight: "700", color: colors.ink, letterSpacing: -0.3 }}>Task complete</Text>
              <Text style={{ fontSize: 12, color: colors.ink3 }}>
                {task?.title}
                {task?.site ? ` · ${task.site}` : ""}
              </Text>
            </View>
          </View>
          <View
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 12,
              backgroundColor: colors.paper,
              borderWidth: 1,
              borderColor: colors.cream2,
              flexDirection: "row",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <Icon name="arrowUpRight" size={16} color={colors.greenDeep} />
            <Text style={{ flex: 1, fontSize: 11, color: colors.ink2, lineHeight: 16 }}>
              {next
                ? "This workflow has a next step. InField drafted the follow-on task — review and push it, or edit before sending."
                : "Every step in this chain is done. Nothing else was drafted."}
            </Text>
          </View>
        </View>

        <View style={{ padding: 20, flex: 1 }}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {next ? (
            <>
              <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: colors.ink3, marginBottom: 8 }}>
                Next task · drafted for you
              </Text>
              <View style={[styles.card, { padding: 0, overflow: "hidden" }]}>
                <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.cream2 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.ink }}>{next.title}</Text>
                  <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 3 }}>
                    {task?.workflowName ? `auto-generated from workflow “${task.workflowName}”` : "Next step on this job"}
                  </Text>
                </View>
                {rows.map((row) => (
                  <View key={row.label} style={{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: colors.cream2 }}>
                    <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.cream, alignItems: "center", justifyContent: "center" }}>
                      <Icon name={row.icon} size={16} color={colors.ink2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 10, color: colors.ink3, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase" }}>{row.label}</Text>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.ink, marginTop: 2 }}>{row.value}</Text>
                      <Text style={{ fontSize: 11, color: colors.ink3 }}>{row.sub}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Text style={styles.sub}>Every step in this chain is done.</Text>
          )}
        </View>

        <View style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.paper, borderTopWidth: 1, borderTopColor: colors.cream2, flexDirection: "row", gap: 8 }}>
          <Pressable onPress={() => router.replace(next?.id && canOpen ? `/task/${next.id}` : "/tasks")} style={[styles.button, styles.secondary, { marginTop: 0, paddingHorizontal: 14 }]}>
            <Text style={[styles.buttonText, styles.secondaryText, { fontSize: 13 }]}>{next ? "Edit first" : "Back to tasks"}</Text>
          </Pressable>
          <Pressable
            onPress={() => void pushNext()}
            disabled={busy}
            style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.green, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            <Text style={{ color: colors.paper, fontSize: 14, fontWeight: "600" }}>
              {busy ? "Sending…" : next ? `Push to ${next.assignee?.split(" ")[0] ?? "next"}` : "Back to tasks"}
            </Text>
            <Icon name="chevronRight" size={16} color={colors.paper} />
          </Pressable>
        </View>
      </View>
    </ScreenShell>
  );
}
