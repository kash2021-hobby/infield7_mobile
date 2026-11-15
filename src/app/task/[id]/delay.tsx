import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { api } from "@/api";
import { Avatar, IconBtn, ScreenShell, TopBar } from "@/chrome";
import { Icon } from "@/icons";
import { loadSession, type Session } from "@/session";
import { colors, styles } from "@/theme";
import type { TaskDetail } from "@/taskDetail";

const reasons = ["Customer unavailable", "Stock shortage", "Traffic / travel", "Waiting on approval", "Payment issue", "Other"];

function etaHint(dueOn: string | null) {
  return dueOn ? `Was due ${dueOn}` : "Optional time for your manager";
}

export default function DelayAlert() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [reason, setReason] = useState(reasons[0]);
  const [detail, setDetail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [routeOn, setRouteOn] = useState(true);
  const [eta, setEta] = useState("");

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const current = await loadSession();
        if (!current || !id) return;
        setSession(current);
        setTask(await api<TaskDetail>(`/tasks/${id}`, {}, current.token));
      })().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [id]),
  );

  async function submit() {
    if (!session || !id) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/tasks/${id}/delay`, {
        method: "POST",
        body: JSON.stringify({ reason, detail: detail || undefined, eta: eta.trim() || undefined }),
      }, session.token);
      setNotice("Your manager can see this on Alerts now.");
      router.replace("/alerts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
    } finally {
      setBusy(false);
    }
  }

  const manager = task?.alertGoesTo;

  return (
    <ScreenShell>
    <View style={{ flex: 1, backgroundColor: colors.cream }}>
      <TopBar
        title="Raise delay alert"
        subtitle={task ? `${task.title}${task.site ? ` · ${task.site}` : ""}` : "This task"}
        left={<IconBtn icon="close" onPress={() => router.back()} />}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
          <View style={{ padding: 12, borderRadius: 12, backgroundColor: colors.coralSoft, flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
            <Icon name="alert" size={16} color={colors.coral} />
            <Text style={{ flex: 1, fontSize: 11, color: colors.ink2, lineHeight: 16 }}>
              Your manager will see this instantly. Dependent tasks in the workflow stay on the list; they are not paused automatically.
            </Text>
          </View>
        </View>
        {error ? <Text style={[styles.error, { marginHorizontal: 20 }]}>{error}</Text> : null}
        {notice ? <Text style={[styles.notice, { marginHorizontal: 20 }]}>{notice}</Text> : null}

        <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.6, color: colors.ink3, marginBottom: 8 }}>REASON</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {reasons.map((item) => {
              const on = item === reason;
              return (
                <Pressable
                  key={item}
                  onPress={() => setReason(item)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderRadius: 999,
                    backgroundColor: on ? colors.ink : colors.paper,
                    borderWidth: 1,
                    borderColor: on ? colors.ink : colors.cream2,
                  }}
                >
                  <Text style={{ color: on ? colors.paper : colors.ink2, fontSize: 12, fontWeight: "600" }}>
                    {on ? "✓ " : ""}{item}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.6, color: colors.ink3, marginBottom: 8 }}>WHAT HAPPENED</Text>
          <TextInput
            style={[styles.input, { minHeight: 68, textAlignVertical: "top" }]}
            value={detail}
            onChangeText={setDetail}
            placeholder="A short note for the manager"
            placeholderTextColor={colors.ink3}
            multiline
          />
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.6, color: colors.ink3, marginBottom: 8 }}>REVISED ETA</Text>
          <View style={[styles.card, { padding: 14, margin: 0 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.cream, alignItems: "center", justifyContent: "center" }}>
                <Icon name="calendar" size={18} color={colors.ink2} />
              </View>
              <View style={{ flex: 1 }}>
                <TextInput
                  style={{ fontSize: 13, fontWeight: "600", color: colors.ink, padding: 0 }}
                  value={eta}
                  onChangeText={setEta}
                  placeholder="Tomorrow, 10:30 AM"
                  placeholderTextColor={colors.ink3}
                />
                <Text style={{ fontSize: 11, color: colors.ink3 }}>{etaHint(task?.dueOn ?? null)}</Text>
              </View>
            </View>
          </View>
        </View>

        {manager ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>
            <View style={[styles.card, { padding: 14, margin: 0 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Avatar name={manager.name} size={38} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10, color: colors.ink3, fontWeight: "600", letterSpacing: 0.6 }}>ALERT GOES TO</Text>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.ink, marginTop: 2 }}>{manager.name}</Text>
                  <Text style={{ fontSize: 11, color: colors.ink3 }}>{manager.role}</Text>
                </View>
                <Pressable onPress={() => setRouteOn((value) => !value)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 11, color: colors.greenDeep, fontWeight: "600" }}>{routeOn ? "On" : "Off"}</Text>
                  <View style={{
                    width: 28,
                    height: 16,
                    borderRadius: 999,
                    backgroundColor: routeOn ? colors.green : colors.cream2,
                    justifyContent: "center",
                    paddingHorizontal: 2,
                    alignItems: routeOn ? "flex-end" : "flex-start",
                  }}>
                    <View style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: colors.paper }} />
                  </View>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        {notice ? (
          <Pressable onPress={() => router.back()} style={[styles.button, styles.secondary, { marginHorizontal: 20, marginTop: 8 }]}>
            <Text style={[styles.buttonText, styles.secondaryText]}>Back to task</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <View style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.paper, borderTopWidth: 1, borderTopColor: colors.cream2 }}>
        <Pressable
          onPress={submit}
          disabled={busy || !routeOn}
          style={{
            backgroundColor: colors.coral,
            borderRadius: 12,
            paddingVertical: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            opacity: busy || !routeOn ? 0.6 : 1,
          }}
        >
          <Icon name="alert" size={16} color={colors.paper} />
          <Text style={{ color: colors.paper, fontSize: 14, fontWeight: "600" }}>{busy ? "Sending…" : "Send delay alert"}</Text>
        </Pressable>
      </View>
    </View>
    </ScreenShell>
  );
}
