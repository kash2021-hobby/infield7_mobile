import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { api } from "@/api";
import { Avatar, BackBtn, ScreenShell, TopBar } from "@/chrome";
import { Icon } from "@/icons";
import { loadSession } from "@/session";
import { colors, styles } from "@/theme";
import type { TaskDetail } from "@/taskDetail";

function stamp(iso: string | null | undefined) {
  if (!iso) return "Waiting";
  return new Date(iso).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
}

export default function WorkflowTimeline() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState("");

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

  const steps = task?.steps.length
    ? task.steps
    : task
      ? [{ id: task.id, title: task.title, status: task.status, n: 1, assignee: task.assignee, assigneeUserId: null, lastAt: task.updates.at(-1)?.createdAt ?? null }]
      : [];
  const done = steps.filter((step) => step.status === "done").length;
  const canOpen = (assigneeUserId?: string | null, stepId?: string) => Boolean(stepId) && (role !== "employee" || !assigneeUserId || assigneeUserId === userId);

  return (
    <ScreenShell>
      <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ paddingBottom: 32 }}>
        <TopBar
          title="Workflow"
          subtitle={task?.workflowName ? `${task.workflowName} · ${steps.length} steps` : task?.title}
          left={<BackBtn />}
        />
        <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.card}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }}>
                <Icon name="briefcase" size={20} color={colors.paper} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink }}>{task?.title ?? "Task"}</Text>
                <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>
                  {done} of {steps.length || 1} steps done{task?.site ? ` · ${task.site}` : ""}
                </Text>
              </View>
              <View style={{ backgroundColor: colors.greenSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ color: colors.greenDeep, fontSize: 11, fontWeight: "700" }}>Live</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 4, marginTop: 12 }}>
              {(steps.length ? steps : [{ status: task?.status }]).map((step, index) => (
                <View
                  key={index}
                  style={{
                    flex: 1,
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: step.status === "done" ? colors.green : step.status === "in_progress" ? colors.amber : colors.cream2,
                  }}
                />
              ))}
            </View>
          </View>

          <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: colors.ink3, marginBottom: 10 }}>
            Handoff chain
          </Text>
          <View style={{ paddingLeft: 8 }}>
            {steps.map((step, index) => {
              const active = step.status === "in_progress" || (step.status !== "done" && steps.findIndex((row) => row.status !== "done") === index);
              const tone = step.status === "done" ? colors.green : active ? colors.amber : colors.ink4;
              const who = step.assignee ?? task?.assignee ?? "Unassigned";
              return (
                <Pressable
                  key={step.id || `${step.title}-${index}`}
                  onPress={() => (canOpen(step.assigneeUserId, step.id) ? router.push(`/task/${step.id}`) : undefined)}
                  style={{ flexDirection: "row", gap: 14, marginBottom: 14 }}
                >
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: step.status === "new" && !active ? colors.paper : tone,
                      borderWidth: 2,
                      borderColor: tone,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {step.status === "done" ? (
                      <Icon name="check" size={14} color={colors.paper} />
                    ) : active ? (
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.paper }} />
                    ) : (
                      <Text style={{ fontSize: 11, fontWeight: "700", color: colors.ink3 }}>{step.n}</Text>
                    )}
                  </View>
                  <View
                    style={[
                      styles.card,
                      {
                        flex: 1,
                        marginBottom: 0,
                        backgroundColor: active ? colors.amberSoft : colors.paper,
                        borderLeftWidth: active ? 3 : 1,
                        borderLeftColor: active ? colors.amber : colors.cream2,
                      },
                    ]}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Avatar name={who} size={24} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: colors.ink }}>{who}</Text>
                        <Text style={{ fontSize: 10, color: colors.ink3 }}>
                          {step.status === "done" ? "Closed this step" : active ? "You · current step" : "Waiting"}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 10, color: colors.ink3 }}>{stamp(step.lastAt)}</Text>
                    </View>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: colors.ink, marginTop: 8 }}>{step.title}</Text>
                    <Text style={{ fontSize: 10, color: colors.ink3, marginTop: 2 }}>
                      {step.status === "done" ? "Completed" : active ? "Waiting to finish" : "Blocked by the previous step"}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}
