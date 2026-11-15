import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { api } from "@/api";
import { Avatar, BackBtn, ScreenShell, TopBar } from "@/chrome";
import { loadSession, type Session } from "@/session";
import { colors, styles } from "@/theme";

type Leave = {
  id: string;
  userId?: string;
  person: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: string;
};

type FormField = {
  key: string;
  label: string;
  type: string;
  hidden: boolean;
  builtin: boolean;
  options: string[];
};

type FormSchema = { fields: FormField[] };

const day = /^\d{4}-\d{2}-\d{2}$/;

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function formatSpan(start: string, end: string) {
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  if (start === end) return a.toLocaleDateString("en-IN", opts);
  return `${a.toLocaleDateString("en-IN", opts)} – ${b.toLocaleDateString("en-IN", opts)}`;
}

function statusLabel(status: string) {
  if (status === "approved") return "Approved";
  if (status === "pending") return "Pending";
  if (status === "rejected") return "Rejected";
  return status;
}

function statusColor(status: string) {
  if (status === "approved") return colors.greenDeep;
  if (status === "pending") return colors.amber;
  return colors.ink3;
}

function fieldLabel(schema: FormSchema | null, key: string, fallback: string) {
  return schema?.fields.find((item) => item.key === key)?.label ?? fallback;
}

function showField(schema: FormSchema | null, key: string) {
  if (!schema) return true;
  const item = schema.fields.find((row) => row.key === key);
  return Boolean(item && !item.hidden);
}

export default function LeaveScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<Leave[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [custom, setCustom] = useState<Record<string, string>>({});

  const refresh = useCallback(async (current?: Session) => {
    const sessionNow = current ?? (await loadSession());
    if (!sessionNow) return;
    setSession(sessionNow);
    const body = await api<{ requests: Leave[] }>("/leave", {}, sessionNow.token);
    setRows(body.requests);
    const layout = await api<FormSchema>("/forms/leave", {}, sessionNow.token).catch(() => null);
    if (layout) setSchema(layout);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  async function submit() {
    if (!session) return;
    if (!day.test(startDate) || !day.test(endDate)) {
      setError("Use dates like 2026-09-29");
      return;
    }
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const created = await api<{ id: string }>("/leave", {
        method: "POST",
        body: JSON.stringify({ startDate, endDate, reason }),
      }, session.token);
      if (created.id && Object.keys(custom).length) {
        await api(`/forms/leave/values/${created.id}`, { method: "PUT", body: JSON.stringify({ values: custom }) }, session.token);
      }
      setCustom({});
      setReason("");
      setNotice("Request sent. A manager still has to approve it.");
      await refresh(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request leave");
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, status: "approved" | "rejected") {
    if (!session) return;
    setError("");
    setNotice("");
    try {
      await api(`/leave/${id}`, { method: "POST", body: JSON.stringify({ status }) }, session.token);
      setNotice(status === "approved" ? "Leave approved." : "Request rejected.");
      await refresh(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update leave");
    }
  }

  const manager = session?.user.role !== "employee";
  const today = todayIst();
  const pending = rows.filter((row) => row.status === "pending").length;
  const onLeave = useMemo(() => {
    const seen = new Set<string>();
    return rows.filter((row) => {
      if (row.status !== "approved" || row.startDate > today || row.endDate < today) return false;
      const key = row.userId ?? row.person;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [rows, today]);
  const shown = filter ? rows.filter((row) => row.status === filter) : rows;

  return (
    <ScreenShell>
    <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <TopBar
        title="Leave"
        subtitle={manager ? "Approve days away" : "Ask for days away"}
        left={manager ? <BackBtn /> : undefined}
      />
      <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
      <Text style={styles.sub}>
        {manager ? "Approve or reject a request, or ask for your own days away." : "Nothing is approved until a manager decides."}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        {[
          ["Pending", String(pending), colors.amber],
          ["On leave today", String(onLeave.length), colors.ink],
        ].map(([label, value, color]) => (
          <View key={label} style={[styles.card, { flex: 1, marginBottom: 0 }]}>
            <Text style={{ fontSize: 10, color: colors.ink3, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase" }}>{label}</Text>
            <Text style={{ fontSize: 22, fontWeight: "700", color, marginTop: 4 }}>{value}</Text>
          </View>
        ))}
      </View>

      {onLeave.length > 0 ? (
        <View style={styles.card}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink, marginBottom: 10 }}>On leave today</Text>
          {onLeave.map((row) => (
            <View key={row.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 }}>
              <Avatar name={row.person} size={28} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.ink }}>{row.person}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink, marginBottom: 8 }}>Request leave</Text>
        {showField(schema, "startDate") ? (
          <>
            <Text style={styles.label}>{fieldLabel(schema, "startDate", "From")}</Text>
            <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} placeholder="2026-09-29" placeholderTextColor={colors.ink3} />
          </>
        ) : null}
        {showField(schema, "endDate") ? (
          <>
            <Text style={styles.label}>{fieldLabel(schema, "endDate", "To")}</Text>
            <TextInput style={styles.input} value={endDate} onChangeText={setEndDate} placeholder="2026-09-30" placeholderTextColor={colors.ink3} />
          </>
        ) : null}
        {showField(schema, "reason") ? (
          <>
            <Text style={styles.label}>{fieldLabel(schema, "reason", "Reason")}</Text>
            <TextInput style={styles.input} value={reason} onChangeText={setReason} placeholder="Family visit" placeholderTextColor={colors.ink3} />
          </>
        ) : null}
        {(schema?.fields ?? []).filter((item) => !item.builtin && !item.hidden).map((item) => (
          <View key={item.key}>
            <Text style={styles.label}>{item.label}</Text>
            {item.type === "dropdown" ? (
              <TextInput
                style={styles.input}
                value={custom[item.key] ?? ""}
                onChangeText={(value) => setCustom((current) => ({ ...current, [item.key]: value }))}
                placeholder={item.options.join(", ") || "Choose"}
                placeholderTextColor={colors.ink3}
              />
            ) : (
              <TextInput
                style={styles.input}
                value={custom[item.key] ?? ""}
                onChangeText={(value) => setCustom((current) => ({ ...current, [item.key]: value }))}
                placeholder={item.type === "date" ? "2026-09-29" : item.label}
                placeholderTextColor={colors.ink3}
                keyboardType={item.type === "number" || item.type === "phone" ? "numeric" : "default"}
              />
            )}
          </View>
        ))}
        <Pressable style={styles.button} disabled={busy} onPress={() => void submit()}>
          <Text style={styles.buttonText}>{busy ? "Sending" : "Request leave"}</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4, marginBottom: 8 }}>
        {(["", "pending", "approved", "rejected"] as const).map((item) => {
          const on = filter === item;
          return (
            <Pressable
              key={item || "all"}
              onPress={() => setFilter(item)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 999,
                backgroundColor: on ? colors.ink : colors.paper,
                borderWidth: 1,
                borderColor: on ? colors.ink : colors.cream2,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: on ? colors.paper : colors.ink }}>
                {item === "" ? `All ${rows.length}` : statusLabel(item)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {shown.length === 0 ? <Text style={styles.sub}>{rows.length === 0 ? "No leave requests yet." : "No requests match this filter."}</Text> : null}
      {shown.map((row) => (
        <View key={row.id} style={styles.card}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Avatar name={row.person} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink }}>{row.person}</Text>
              <Text style={[styles.sub, { marginBottom: 0, marginTop: 2 }]}>{formatSpan(row.startDate, row.endDate)}</Text>
            </View>
            <Text style={{ fontSize: 11, fontWeight: "700", color: statusColor(row.status) }}>{statusLabel(row.status)}</Text>
          </View>
          <Text style={[styles.sub, { marginTop: 8, marginBottom: 0 }]}>{row.reason || "No reason given"}</Text>
          {manager && row.status === "pending" ? (
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Pressable style={[styles.button, { flex: 1, marginTop: 0 }]} onPress={() => void decide(row.id, "approved")}>
                <Text style={styles.buttonText}>Approve</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.secondary, { flex: 1, marginTop: 0 }]} onPress={() => void decide(row.id, "rejected")}>
                <Text style={[styles.buttonText, styles.secondaryText]}>Reject</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ))}
      </View>
    </ScrollView>
    </ScreenShell>
  );
}
