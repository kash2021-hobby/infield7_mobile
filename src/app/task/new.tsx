import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { api } from "@/api";
import { BackBtn, ScreenShell, TopBar } from "@/chrome";
import { loadSession, type Session } from "@/session";
import { colors, styles } from "@/theme";

type Startable = { id: string; name: string; firstTitle: string | null };

function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export default function NewTask() {
  const [session, setSession] = useState<Session | null>(null);
  const [startable, setStartable] = useState<Startable[]>([]);
  const [workflowId, setWorkflowId] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const current = await loadSession();
        if (!current) return;
        setSession(current);
        const body = await api<{ workflows: Startable[] }>("/workflows/startable", {}, current.token);
        setStartable(body.workflows);
        const pick = body.workflows.find((row) => /patient/i.test(row.name)) ?? body.workflows[0];
        if (pick) setWorkflowId(pick.id);
      })().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, []),
  );

  async function create() {
    if (!session) return;
    setError("");
    setBusy(true);
    try {
      if (workflowId) {
        const started = await api<{ taskId: string | null }>(`/workflows/${workflowId}/run-now`, { method: "POST", body: "{}" }, session.token);
        if (started.taskId) {
          router.replace(`/task/${started.taskId}/update`);
          return;
        }
        router.replace("/tasks");
        return;
      }
      const created = await api<{ id: string }>(
        "/tasks",
        { method: "POST", body: JSON.stringify({ title: title.trim(), assigneeUserId: session.user.id, dueOn: todayIso() }) },
        session.token,
      );
      router.replace(`/task/${created.id}/update`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the task");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenShell>
      <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ paddingBottom: 32 }}>
        <TopBar title="New task" left={<BackBtn />} />
        {error ? <Text style={[styles.error, { marginHorizontal: 20 }]}>{error}</Text> : null}
        <View style={{ paddingHorizontal: 20 }}>
          <Text style={styles.label}>Assign to</Text>
          <View style={[styles.input, { marginBottom: 16 }]}>
            <Text style={{ fontSize: 16, color: colors.ink }}>{session?.user.name ?? "You"}</Text>
          </View>
          {startable.length ? (
            <>
              <Text style={styles.label}>What to start</Text>
              <Pressable
                onPress={() => setWorkflowId("")}
                style={[styles.input, { marginBottom: 8, borderColor: workflowId === "" ? colors.ink : colors.cream2 }]}
              >
                <Text>Own task</Text>
              </Pressable>
              {startable.map((row) => (
                <Pressable
                  key={row.id}
                  onPress={() => setWorkflowId(row.id)}
                  style={[styles.input, { marginBottom: 8, borderColor: workflowId === row.id ? colors.ink : colors.cream2 }]}
                >
                  <Text style={{ fontWeight: "600" }}>{row.name}</Text>
                  {row.firstTitle ? <Text style={{ color: colors.ink3, marginTop: 4, fontSize: 12 }}>{row.firstTitle}</Text> : null}
                </Pressable>
              ))}
            </>
          ) : null}
          {workflowId ? (
            <Text style={styles.sub}>Create assigns this to you, then opens the form.</Text>
          ) : (
            <>
              <Text style={styles.label}>Task title</Text>
              <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="What needs doing" placeholderTextColor={colors.ink3} />
            </>
          )}
          <Pressable
            style={[styles.button, { opacity: busy || (!workflowId && title.trim().length < 2) ? 0.5 : 1 }]}
            disabled={busy || (!workflowId && title.trim().length < 2)}
            onPress={() => void create()}
          >
            <Text style={styles.buttonText}>Create task</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}
