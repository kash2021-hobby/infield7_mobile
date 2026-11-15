import { useCallback, useEffect, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "expo-router";
import { api, ApiError } from "@/api";
import { Avatar, BackBtn, ScreenShell, TopBar } from "@/chrome";
import { loadSession } from "@/session";
import { colors, styles } from "@/theme";

type Lead = {
  id: string;
  name: string;
  phone: string;
  email: string;
  source: string;
  city: string;
  message: string;
  status: string;
  assignee: string | null;
  remindOn: string | null;
};

type Note = { id: string; body: string; who: string; at: string };

function statusLabel(status: string) {
  if (status === "new") return "New";
  if (status === "follow_up") return "Follow-up";
  if (status === "converted") return "Converted";
  if (status === "cold") return "Cold";
  return status;
}

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function ymd(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function prettyDay(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function DayCalendar({ value, onChange }: { value: string; onChange: (day: string) => void }) {
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayIst();
  const [year, month] = selected.split("-").map(Number);
  const [cursor, setCursor] = useState({ year, month });
  useEffect(() => {
    setCursor({ year, month });
  }, [year, month]);
  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month - 1, 1);
    const start = (first.getDay() + 6) % 7;
    const count = new Date(cursor.year, cursor.month, 0).getDate();
    const blanks = Array.from({ length: start }, () => null);
    const days = Array.from({ length: count }, (_, i) => i + 1);
    return [...blanks, ...days];
  }, [cursor.year, cursor.month]);
  const today = todayIst();
  const title = new Date(cursor.year, cursor.month - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  function shift(delta: number) {
    const next = new Date(cursor.year, cursor.month - 1 + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() + 1 });
  }

  return (
    <View style={{ marginTop: 8, backgroundColor: colors.cream, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: colors.cream2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Pressable onPress={() => shift(-1)} hitSlop={8} style={{ padding: 6 }}>
          <Text style={{ fontSize: 18, color: colors.ink }}>‹</Text>
        </Pressable>
        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.ink }}>{title}</Text>
        <Pressable onPress={() => shift(1)} hitSlop={8} style={{ padding: 6 }}>
          <Text style={{ fontSize: 18, color: colors.ink }}>›</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: "row" }}>
        {WEEKDAYS.map((label, index) => (
          <Text key={`${label}-${index}`} style={{ flex: 1, textAlign: "center", fontSize: 11, fontWeight: "700", color: colors.ink3 }}>
            {label}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 4 }}>
        {cells.map((day, index) => {
          if (!day) return <View key={`empty-${index}`} style={{ width: "14.28%", height: 40 }} />;
          const iso = ymd(cursor.year, cursor.month, day);
          const on = iso === selected;
          const isToday = iso === today;
          return (
            <Pressable
              key={iso}
              onPress={() => onChange(iso)}
              style={{ width: "14.28%", height: 40, alignItems: "center", justifyContent: "center" }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: on ? colors.ink : "transparent",
                  borderWidth: isToday && !on ? 1 : 0,
                  borderColor: colors.ink4,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: on || isToday ? "700" : "500", color: on ? colors.paper : colors.ink }}>{day}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function LeadDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [lead, setLead] = useState<Lead | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [remindOn, setRemindOn] = useState(todayIst);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<"follow_up" | "converted" | "cold" | null>(null);

  const refresh = useCallback(async () => {
    const session = await loadSession();
    if (!session || !id) return;
    const body = await api<{ lead: Lead; notes: Note[] }>(`/leads/${id}`, {}, session.token);
    setLead(body.lead);
    setNotes(body.notes);
    setRemindOn(body.lead.remindOn || todayIst());
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load this lead"));
    }, [refresh]),
  );

  async function save() {
    const session = await loadSession();
    if (!session || !id || !pick) return;
    if (pick === "follow_up") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(remindOn)) {
        setError("Pick a call-back date");
        return;
      }
      if (!note.trim()) {
        setError("Write what you talked and when to call again");
        return;
      }
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const body = await api<{ lead: Lead; notes: Note[] }>(`/leads/${id}`, {
        method: "POST",
        body: JSON.stringify({
          status: pick,
          remindOn: pick === "follow_up" ? remindOn : undefined,
          note: note.trim() || undefined,
        }),
      }, session.token);
      setLead(body.lead);
      setNotes(body.notes);
      setNote("");
      setPick(null);
      setNotice(pick === "follow_up" ? "Follow-up saved." : `Marked ${statusLabel(pick).toLowerCase()}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update this lead");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenShell>
      <TopBar title={lead?.name || "Lead"} subtitle={lead ? statusLabel(lead.status) : ""} left={<BackBtn />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
        {error ? <Text style={{ color: colors.coral, marginBottom: 12 }}>{error}</Text> : null}
        {notice ? <Text style={{ color: colors.greenDeep, marginBottom: 12 }}>{notice}</Text> : null}
        {lead ? (
          <View style={styles.card}>
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              <Avatar name={lead.name} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: colors.ink }}>{lead.name}</Text>
                <Text style={{ fontSize: 13, color: colors.ink2 }}>{lead.assignee ? `Assigned to ${lead.assignee}` : "Not assigned yet"}</Text>
              </View>
            </View>
            {lead.phone ? (
              <Pressable onPress={() => Linking.openURL(`tel:${lead.phone}`)} style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 16, fontWeight: "600", color: colors.ink }}>{lead.phone}</Text>
                <Text style={{ fontSize: 12, color: colors.ink3 }}>Tap to call</Text>
              </Pressable>
            ) : null}
            {lead.email ? <Text style={{ marginTop: 8, color: colors.ink2 }}>{lead.email}</Text> : null}
            {lead.city || lead.source ? <Text style={{ marginTop: 4, color: colors.ink3 }}>{[lead.city, lead.source].filter(Boolean).join(" · ")}</Text> : null}
            {lead.message ? <Text style={{ marginTop: 8, color: colors.ink }}>{lead.message}</Text> : null}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: colors.ink }}>Update</Text>
          <Text style={[styles.sub, { marginTop: 4, marginBottom: 0 }]}>Pick a status. Follow-up needs a date and a note.</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {([
              ["follow_up", "Follow-up"],
              ["converted", "Converted"],
              ["cold", "Cold"],
            ] as const).map(([id, label]) => (
              <Pressable
                key={id}
                disabled={busy}
                onPress={() => {
                  setError("");
                  setNotice("");
                  setPick(id);
                  if (id === "follow_up" && !remindOn) setRemindOn(todayIst());
                }}
                style={[styles.button, pick === id ? null : styles.secondary, { flexGrow: 1, marginTop: 0 }]}
              >
                <Text style={[styles.buttonText, pick === id ? null : styles.secondaryText]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {pick === "follow_up" ? (
            <>
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.ink3, marginTop: 16 }}>CALL BACK ON *</Text>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.ink, marginTop: 4 }}>{prettyDay(remindOn || todayIst())}</Text>
              <DayCalendar value={remindOn || todayIst()} onChange={setRemindOn} />
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.ink3, marginTop: 12 }}>NOTE *</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="What you talked, when to call again"
                placeholderTextColor={colors.ink3}
                style={[styles.input, { height: 90, textAlignVertical: "top", marginBottom: 0 }]}
                multiline
              />
            </>
          ) : null}
          {pick === "converted" || pick === "cold" ? (
            <>
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.ink3, marginTop: 16 }}>NOTE (optional)</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder={pick === "converted" ? "What closed this lead" : "Why this is cold"}
                placeholderTextColor={colors.ink3}
                style={[styles.input, { height: 90, textAlignVertical: "top", marginBottom: 0 }]}
                multiline
              />
            </>
          ) : null}
          {pick ? (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Pressable disabled={busy} onPress={() => void save()} style={[styles.button, { flex: 1 }]}>
                <Text style={styles.buttonText}>{busy ? "Saving" : `Save ${statusLabel(pick).toLowerCase()}`}</Text>
              </Pressable>
              <Pressable
                disabled={busy}
                onPress={() => {
                  setPick(null);
                  setError("");
                }}
                style={[styles.button, styles.secondary, { flex: 1 }]}
              >
                <Text style={[styles.buttonText, styles.secondaryText]}>Cancel</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {notes.length > 0 ? (
          <View style={styles.card}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.ink, marginBottom: 8 }}>Notes</Text>
            {notes.map((item) => (
              <View key={item.id} style={{ marginBottom: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.ink }}>{item.who}</Text>
                <Text style={{ fontSize: 12, color: colors.ink3 }}>{new Date(item.at).toLocaleString("en-IN")}</Text>
                <Text style={{ fontSize: 14, color: colors.ink, marginTop: 2 }}>{item.body}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </ScreenShell>
  );
}
