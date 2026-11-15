import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Svg, { Circle } from "react-native-svg";
import { api } from "@/api";
import { Avatar, BackBtn, IconBtn, ScreenShell, TopBar } from "@/chrome";
import { Icon } from "@/icons";
import { loadSession, type Session } from "@/session";
import { colors, styles } from "@/theme";
import { proofLine, type TaskDetail, type Step } from "@/taskDetail";

function clock(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function dueChip(dueOn: string | null) {
  if (!dueOn) return null;
  const day = dueOn.slice(0, 10);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  if (day < today) return { label: "Overdue", tone: "coral" as const };
  if (day === today) return { label: "Due today", tone: "amber" as const };
  return { label: `Due ${day}`, tone: "neutral" as const };
}

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const current = await loadSession();
    if (!current || !id) return;
    setSession(current);
    setTask(await api<TaskDetail>(`/tasks/${id}`, {}, current.token));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  function isReview(step: Step) {
    return step.kind === "handoff" || step.kind === "approval" || step.kind === "end" || /\breview\b/i.test(step.title);
  }

  async function startStep(step: Step) {
    if (!session || !step.id) return false;
    setError("");
    try {
      await api(`/tasks/${step.id}`, { method: "POST", body: JSON.stringify({ status: "in_progress" }) }, session.token);
      await refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start this step");
      return false;
    }
  }

  async function pickBranch(step: Step, pick: "if" | "else") {
    if (!session || !step.id) return;
    setError("");
    try {
      if (step.status === "new") {
        const started = await startStep(step);
        if (!started) return;
      }
      await api(`/tasks/${step.id}/branch`, { method: "POST", body: JSON.stringify({ pick }) }, session.token);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not choose a path");
    }
  }

  async function openEvidence(step: Step) {
    if (!step.id) {
      setError("Finish the previous step first. This one opens after that.");
      return;
    }
    if (session?.user.role === "employee" && isReview(step)) {
      setError("This is a review step. Your manager closes it. Keep going on the next field step.");
      return;
    }
    if (step.status === "new") {
      const started = await startStep(step);
      if (!started) return;
    }
    router.push(`/task/${step.id}/update`);
  }

  if (!task) {
    return (
      <ScreenShell>
        <View style={styles.screen}>
          <TopBar title="Task" left={<BackBtn />} />
          {error ? <Text style={styles.error}>{error}</Text> : <Text style={styles.sub}>Loading…</Text>}
        </View>
      </ScreenShell>
    );
  }

  const steps = task.steps.length ? task.steps : [{ id: task.id, title: task.title, status: task.status, n: 1, assigneeUserId: null }];
  const doneCount = steps.filter((step) => step.status === "done").length;
  const employee = session?.user.role === "employee";
  const canAct = (step: Step) => {
    if (!step.id || step.status === "locked") return false;
    if (employee && isReview(step)) return false;
    return !employee || !step.assigneeUserId || step.assigneeUserId === session?.user.id;
  };
  const nextOpen = steps.find((step) => step.status !== "done");
  const current = nextOpen && canAct(nextOpen) ? nextOpen : null;
  const due = dueChip(task.dueOn);
  const overdue = due?.tone === "coral";
  const pct = doneCount / Math.max(steps.length, 1);
  const assigner = task.alertGoesTo;

  return (
    <ScreenShell>
      <View style={{ flex: 1, backgroundColor: colors.cream }}>
        <TopBar
          title={task.title}
          subtitle={task.site ? `${task.site}` : task.workflowName ?? undefined}
          left={<BackBtn />}
          right={<IconBtn icon="message" />}
        />
        <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
          {error ? <Text style={[styles.error, { marginHorizontal: 20 }]}>{error}</Text> : null}

          <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
            <View style={[styles.card, { padding: 16, marginBottom: 0 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <View style={{ width: 60, height: 60 }}>
                  <Svg width={60} height={60} viewBox="0 0 60 60">
                    <Circle cx={30} cy={30} r={24} fill="none" stroke={colors.cream2} strokeWidth={5} />
                    <Circle
                      cx={30}
                      cy={30}
                      r={24}
                      fill="none"
                      stroke={colors.green}
                      strokeWidth={5}
                      strokeDasharray={`${2 * Math.PI * 24}`}
                      strokeDashoffset={`${2 * Math.PI * 24 * (1 - pct)}`}
                      strokeLinecap="round"
                      transform="rotate(-90 30 30)"
                    />
                  </Svg>
                  <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink }}>
                      {doneCount}/{steps.length}
                    </Text>
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {overdue ? (
                      <View style={{ backgroundColor: colors.coralSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ color: colors.coral, fontSize: 11, fontWeight: "700" }}>High priority</Text>
                      </View>
                    ) : null}
                    {due ? (
                      <View
                        style={{
                          backgroundColor: due.tone === "coral" ? colors.coralSoft : due.tone === "amber" ? colors.amberSoft : colors.cream,
                          borderRadius: 999,
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Icon name="clock" size={10} color={due.tone === "coral" ? colors.coral : "#8A5A10"} />
                        <Text style={{ color: due.tone === "coral" ? colors.coral : "#8A5A10", fontSize: 11, fontWeight: "700" }}>{due.label}</Text>
                      </View>
                    ) : null}
                  </View>
                  {assigner ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
                      <Avatar name={assigner.name} size={24} />
                      <Text style={{ fontSize: 12, color: colors.ink3 }}>
                        Assigned by <Text style={{ fontWeight: "700", color: colors.ink2 }}>{assigner.name}</Text>
                      </Text>
                    </View>
                  ) : task.assignee ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
                      <Avatar name={task.assignee} size={24} />
                      <Text style={{ fontSize: 12, color: colors.ink3 }}>{task.assignee}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          </View>

          <View style={{ paddingHorizontal: 20, paddingBottom: 8, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: colors.ink3 }}>Steps to complete</Text>
            <Pressable onPress={() => router.push(`/task/${task.id}/workflow`)}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.ink2 }}>View timeline</Text>
            </Pressable>
          </View>

          <View style={{ paddingHorizontal: 16, gap: 8, paddingBottom: 12 }}>
            {steps.map((step) => {
              const isActive = nextOpen === step;
              const done = step.status === "done";
              return (
                <View
                  key={step.id}
                  style={[
                    styles.card,
                    {
                      padding: 0,
                      marginBottom: 0,
                      overflow: "hidden",
                      borderLeftWidth: 4,
                      borderLeftColor: done ? colors.green : isActive ? colors.amber : colors.cream2,
                      backgroundColor: isActive ? colors.amberSoft : colors.paper,
                    },
                  ]}
                >
                  <View style={{ padding: 14, flexDirection: "row", gap: 12 }}>
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: done ? colors.green : isActive ? colors.ink : colors.cream2,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {done ? (
                        <Icon name="check" size={16} color={colors.paper} />
                      ) : (
                        <Text style={{ color: isActive ? colors.paper : colors.ink3, fontWeight: "700", fontSize: 12 }}>{step.n}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "600",
                          lineHeight: 18,
                          color: done ? colors.ink3 : colors.ink,
                          textDecorationLine: done ? "line-through" : "none",
                        }}
                      >
                        {step.title}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                        <Icon name={step.evidence === "geofence" ? "pin" : step.evidence === "signature" ? "check" : "camera"} size={12} color={colors.ink3} />
                        <Text style={{ fontSize: 11, color: colors.ink3 }}>
                          {proofLine(step.proofs, step.evidence)}
                        </Text>
                      </View>
                      {done ? (
                        <Text style={{ fontSize: 10, color: colors.greenDeep, marginTop: 6, fontFamily: "monospace" }}>
                          ✓ submitted{step.lastAt ? ` ${clock(step.lastAt)}` : ""}
                        </Text>
                      ) : null}
                      {isActive && canAct(step) && step.status !== "done" && step.kind === "branch" ? (
                        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                          <Pressable
                            onPress={() => void pickBranch(step, "if")}
                            style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.ink, alignItems: "center" }}
                          >
                            <Text style={{ color: colors.paper, fontSize: 12, fontWeight: "600" }}>{step.branch?.ifLabel ?? task.branch?.ifLabel ?? "Yes"}</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => void pickBranch(step, "else")}
                            style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.cream2, alignItems: "center" }}
                          >
                            <Text style={{ color: colors.ink, fontSize: 12, fontWeight: "600" }}>{step.branch?.elseLabel ?? task.branch?.elseLabel ?? "No"}</Text>
                          </Pressable>
                        </View>
                      ) : null}
                      {isActive && canAct(step) && step.status !== "done" && step.kind !== "branch" ? (
                        <Pressable
                          onPress={() => void openEvidence(step)}
                          style={{
                            marginTop: 10,
                            alignSelf: "flex-start",
                            paddingVertical: 8,
                            paddingHorizontal: 12,
                            borderRadius: 8,
                            backgroundColor: colors.ink,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <Text style={{ color: colors.paper, fontSize: 12, fontWeight: "600" }}>Mark step done</Text>
                          <Icon name="chevronRight" size={12} color={colors.paper} />
                        </Pressable>
                      ) : null}
                      {isActive && step.status === "locked" ? (
                        <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 8 }}>Opens after you finish the previous step.</Text>
                      ) : null}
                      {isActive && employee && isReview(step) ? (
                        <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 8 }}>Waiting on manager review — you cannot close this step.</Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

          <Pressable
            onPress={() => router.push(`/task/${task.id}/workflow`)}
            style={{
              marginHorizontal: 20,
              marginBottom: 12,
              padding: 12,
              borderRadius: 12,
              backgroundColor: colors.greenTint,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: colors.green,
              flexDirection: "row",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <Icon name="arrowUpRight" size={16} color={colors.greenDeep} />
            <Text style={{ flex: 1, fontSize: 11, color: colors.ink2, lineHeight: 16 }}>
              <Text style={{ fontWeight: "700", color: colors.greenDeep }}>
                {task.workflowName ? "Auto-chain enabled. " : "Workflow timeline. "}
              </Text>
              {task.nextPerson
                ? `When you finish this step, InField will draft the next task and notify ${task.nextPerson}.`
                : "Tap to see the handoff chain, delay, and who closed each step."}
            </Text>
          </Pressable>
        </ScrollView>

        <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.paper, borderTopWidth: 1, borderTopColor: colors.cream2 }}>
          <Pressable
            onPress={() => router.push(`/task/${task.id}/delay`)}
            style={{
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: 12,
              backgroundColor: colors.coralSoft,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icon name="alert" size={14} color="#B42318" />
            <Text style={{ color: "#B42318", fontSize: 13, fontWeight: "600" }}>Delay alert</Text>
          </Pressable>
          {current && current.status !== "done" ? (
            <Pressable
              onPress={() => void openEvidence(current)}
              style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ color: colors.paper, fontSize: 14, fontWeight: "600" }}>Update progress</Text>
            </Pressable>
          ) : (
            <View style={{ flex: 1, justifyContent: "center" }}>
              <Text style={[styles.sub, { marginBottom: 0 }]}>
                {nextOpen && !current ? "The next step is not yours to close." : "Every step is done."}
              </Text>
            </View>
          )}
        </View>
      </View>
    </ScreenShell>
  );
}
