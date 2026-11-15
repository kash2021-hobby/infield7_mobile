import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { api } from "@/api";
import { Avatar, BackBtn, FilterChip, IconBtn, ScreenShell, TopBar } from "@/chrome";
import { Icon } from "@/icons";
import { loadSession, type Session } from "@/session";
import { flushTaskUpdates, queuedTaskUpdates } from "@/task-outbox";
import { colors, styles } from "@/theme";

type Task = {
  id: string;
  title: string;
  status: string;
  dueOn: string | null;
  assignee: string | null;
  department: string | null;
  site: string | null;
  hasPhoto: boolean;
  workflowId: string | null;
  workflowName: string | null;
  createdAt: string;
  lastAt: string | null;
  stepN: number;
  stepTotal: number;
  stepDone: number;
  previousTitle: string | null;
  previousPerson: string | null;
  previousRole: string | null;
  nextTitle: string | null;
  nextPerson: string | null;
};

function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function dayStamp(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function dueDay(task: Task) {
  return task.dueOn ? task.dueOn.slice(0, 10) : null;
}

function ago(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function addDays(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function shortName(name: string | null) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
}

function dueChip(task: Task, today: string) {
  const day = dueDay(task);
  if (!day) return { label: "No due date", tone: "neutral" as const };
  if (day < today) return { label: "Overdue", tone: "coral" as const };
  if (day === today) return { label: "Today", tone: "amber" as const };
  if (day === addDays(today, 1)) return { label: "Tomorrow", tone: "neutral" as const };
  return { label: day, tone: "neutral" as const };
}

function chainLabel(task: Task) {
  if (task.nextPerson) return `Blocks ${shortName(task.nextPerson)}`;
  if (dueChip(task, todayIso()).tone === "coral") return "Delay alert raised";
  if (task.workflowId) return "No dependency";
  return null;
}

export default function Tasks() {
  const [session, setSession] = useState<Session | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"inbox" | "later" | "done">("inbox");
  const [waitingIds, setWaitingIds] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    const current = await loadSession();
    if (!current) return;
    setSession(current);
    await flushTaskUpdates(current);
    const body = await api<{ tasks: Task[] }>("/tasks", {}, current.token);
    setTasks(body.tasks);
    setWaitingIds((await queuedTaskUpdates()).map((row) => row.taskId));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  const today = todayIso();
  const groups = useMemo(() => {
    const tomorrow = addDays(today, 1);
    const toAccept = tasks.filter((task) => task.status === "new");
    const inProgress = tasks.filter((task) => task.status === "in_progress");
    const tomorrowTasks = toAccept.filter((task) => dueDay(task) === tomorrow);
    const later = toAccept.filter((task) => {
      const day = dueDay(task);
      return Boolean(day && day > tomorrow);
    });
    const doneToday = tasks.filter((task) => {
      if (task.status !== "done") return false;
      const closed = dayStamp(task.lastAt) || dayStamp(task.createdAt);
      return closed === today;
    });
    const doneEarlier = tasks.filter((task) => {
      if (task.status !== "done") return false;
      const closed = dayStamp(task.lastAt) || dayStamp(task.createdAt);
      return closed !== today;
    });
    return { toAccept, inProgress, tomorrowTasks, later, doneToday, doneEarlier };
  }, [tasks, today]);

  async function accept(id: string) {
    if (!session) return;
    setError("");
    try {
      await api(`/tasks/${id}`, { method: "POST", body: JSON.stringify({ status: "in_progress" }) }, session.token);
      router.push(`/task/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept the task");
    }
  }

  const who = session?.user.name || session?.user.phone || "You";
  const role = session?.user.role === "employee" ? "Field executive" : session?.user.role === "manager" ? "Manager" : session?.user.role ?? "";
  const inboxCount = groups.toAccept.length + groups.inProgress.length;
  const upcomingCount = groups.tomorrowTasks.length + groups.later.length;
  const doneCount = groups.doneToday.length + groups.doneEarlier.length;

  return (
    <ScreenShell>
      <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ paddingBottom: 24 }}>
        <TopBar
          title="My tasks"
          subtitle={`${who}${role ? ` · ${role}` : ""}`}
          left={session?.user.role === "employee" ? undefined : <BackBtn />}
          right={<IconBtn icon="plus" onPress={() => router.push("/task/new")} />}
        />
        {error ? <Text style={[styles.error, { marginHorizontal: 20 }]}>{error}</Text> : null}
        {waitingIds.length ? (
          <Text style={{ marginHorizontal: 20, marginBottom: 8, fontSize: 12, color: colors.greenDeep, fontWeight: "600" }}>
            {waitingIds.length} step{waitingIds.length === 1 ? "" : "s"} waiting to upload
          </Text>
        ) : null}

        <View style={{ paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", gap: 8 }}>
          <Stat label="To accept" value={groups.toAccept.length} tone="coral" />
          <Stat label="In progress" value={groups.inProgress.length} tone="amber" />
          <Stat label="Done today" value={groups.doneToday.length} tone="green" />
        </View>

        <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: 20, paddingBottom: 12 }}>
          <FilterChip label={`Inbox ${inboxCount}`} active={tab === "inbox"} onPress={() => setTab("inbox")} />
          <FilterChip label={`Later ${upcomingCount}`} active={tab === "later"} onPress={() => setTab("later")} />
          <FilterChip label={`Done ${doneCount}`} active={tab === "done"} onPress={() => setTab("done")} />
        </View>

        {tab === "inbox" ? (
          <>
            <Section title="Action needed" />
            <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
              {groups.toAccept.length === 0 ? (
                <Text style={[styles.sub, { marginBottom: 8 }]}>Nothing waiting to accept.</Text>
              ) : (
                groups.toAccept.map((task) => (
                  <View key={task.id} style={[styles.card, { borderLeftWidth: 4, borderLeftColor: colors.coral, padding: 14, marginBottom: 8 }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                      <ToneChip tone="coral" label={task.workflowId ? "Auto-suggested" : "To start"} />
                      <Text style={{ fontSize: 10, color: colors.ink3 }}>
                        {task.workflowName ? `from ${task.workflowName} · ` : ""}
                        {ago(task.createdAt)}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: colors.ink, letterSpacing: -0.2 }}>{task.title}</Text>
                    <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 4, lineHeight: 18 }}>
                      {task.previousPerson && task.previousTitle
                        ? `System created this after ${task.previousPerson} finished “${task.previousTitle}”. Accept to add to your list.`
                        : "Accept to add it to your list, then open steps, delay, or the timeline."}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                      <Pressable onPress={() => accept(task.id)} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.ink, alignItems: "center" }}>
                        <Text style={{ color: colors.paper, fontSize: 13, fontWeight: "600" }}>Accept</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => router.push(`/task/${task.id}`)}
                        style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.cream2 }}
                      >
                        <Text style={{ color: colors.ink, fontSize: 13, fontWeight: "600" }}>View</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </View>

            <Section title="In progress" />
            <View style={{ paddingHorizontal: 16, gap: 8, marginBottom: 8 }}>
              {groups.inProgress.length === 0 ? <Text style={[styles.sub, { marginBottom: 8 }]}>Nothing in progress.</Text> : null}
              {groups.inProgress.map((task) => (
                <WorkCard key={task.id} task={task} today={today} waiting={waitingIds.includes(task.id)} onOpen={() => router.push(`/task/${task.id}`)} />
              ))}
            </View>

            {groups.doneToday.length > 0 ? (
              <>
                <Section title="Done today" />
                <View style={{ paddingHorizontal: 16, gap: 8, marginBottom: 8 }}>
                  {groups.doneToday.map((task) => (
                    <DoneCard key={task.id} task={task} stamp="Today" />
                  ))}
                </View>
              </>
            ) : null}
          </>
        ) : null}

        {tab === "later" ? (
          <View style={{ paddingHorizontal: 16, gap: 8 }}>
            {upcomingCount === 0 ? <Text style={styles.sub}>Nothing lined up after today.</Text> : null}
            {groups.tomorrowTasks.map((task) => (
              <WorkCard key={task.id} task={task} today={today} onOpen={() => router.push(`/task/${task.id}`)} />
            ))}
            {groups.later.map((task) => (
              <WorkCard key={task.id} task={task} today={today} onOpen={() => router.push(`/task/${task.id}`)} />
            ))}
          </View>
        ) : null}

        {tab === "done" ? (
          <View style={{ paddingHorizontal: 16, gap: 8 }}>
            {doneCount === 0 ? <Text style={styles.sub}>Nothing closed yet.</Text> : null}
            {groups.doneToday.map((task) => (
              <DoneCard key={task.id} task={task} stamp="Today" />
            ))}
            {groups.doneEarlier.map((task) => (
              <DoneCard key={task.id} task={task} stamp={dayStamp(task.lastAt) || dayStamp(task.createdAt)} />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </ScreenShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "coral" | "amber" | "green" }) {
  const dot = tone === "green" ? colors.green : tone === "amber" ? colors.amber : colors.coral;
  return (
    <View style={[styles.card, { flex: 1, marginBottom: 0, padding: 12 }]}>
      <Text style={{ fontSize: 10, color: colors.ink3, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase" }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 4 }}>
        <Text style={{ fontSize: 22, fontWeight: "700", color: colors.ink }}>{value}</Text>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} />
      </View>
    </View>
  );
}

function Section({ title }: { title: string }) {
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: colors.ink3 }}>{title}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.cream2 }} />
    </View>
  );
}

function ToneChip({ tone, label, icon }: { tone: "coral" | "amber" | "neutral" | "green"; label: string; icon?: "clock" | "arrowUpRight" }) {
  const bg = tone === "coral" ? colors.coralSoft : tone === "amber" ? colors.amberSoft : tone === "green" ? colors.greenSoft : colors.cream;
  const fg = tone === "coral" ? colors.coral : tone === "amber" ? "#8A5A10" : tone === "green" ? colors.greenDeep : colors.ink2;
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, flexDirection: "row", alignItems: "center", gap: 4 }}>
      {icon ? <Icon name={icon} size={11} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: 11, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

function WorkCard({ task, today, onOpen, waiting }: { task: Task; today: string; onOpen: () => void; waiting?: boolean }) {
  const overdue = Boolean(dueDay(task) && dueDay(task)! < today);
  const total = task.stepTotal || 1;
  const done = task.stepDone;
  const width = Math.round((done / Math.max(total, 1)) * 100);
  const due = dueChip(task, today);
  const chain = chainLabel(task);
  const from = task.previousPerson || task.assignee || "Unassigned";
  const fromRole = task.previousRole || task.department || "Field";
  return (
    <Pressable onPress={onOpen} style={[styles.card, { padding: 14, marginBottom: 0 }]}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Avatar name={from} size={32} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.ink, letterSpacing: -0.2, lineHeight: 18 }}>{task.title}</Text>
          <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>
            {from} · {fromRole}
          </Text>
          {task.stepTotal > 0 ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
              <View style={{ flex: 1, height: 6, borderRadius: 4, backgroundColor: colors.cream2, overflow: "hidden" }}>
                <View style={{ width: `${width}%`, height: "100%", backgroundColor: overdue ? colors.coral : colors.green }} />
              </View>
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.ink3 }}>
                {task.stepN}/{task.stepTotal} steps
              </Text>
            </View>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            <ToneChip tone={due.tone} label={due.label} icon="clock" />
            {waiting ? <ToneChip tone="green" label="Waiting to upload" /> : null}
            {chain ? <ToneChip tone="neutral" label={chain} icon="arrowUpRight" /> : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function DoneCard({ task, stamp }: { task: Task; stamp: string }) {
  return (
    <Pressable onPress={() => router.push(`/task/${task.id}`)} style={[styles.card, { padding: 14, marginBottom: 0 }]}>
      <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink }}>{task.title}</Text>
      <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 4 }}>
        {task.site ?? "No site"} · {stamp}
        {task.hasPhoto ? " · photo on file" : ""}
      </Text>
    </Pressable>
  );
}
