import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { api } from "@/api";
import { Avatar, BackBtn, IconBtn, ScreenShell, TopBar } from "@/chrome";
import { Icon } from "@/icons";
import { sharePayrollPdf } from "@/reportPdf";
import { loadSession } from "@/session";
import { colors, styles } from "@/theme";

type Line = { name: string; kind: string; amount: number };
type Person = {
  id?: string;
  employeeId: string;
  person: string;
  templateName: string | null;
  cycle: string | null;
  presentDays: number;
  weekdays: number;
  hours: number;
  checkins: number;
  late: number;
  visits: number;
  lines: Line[];
  gross: number;
  deductions: number;
  net: number;
  missingTemplate: boolean;
};
type Cycle = {
  id: string;
  status: string;
  from: string;
  to: string;
  periodKey: string;
  payout: number;
  employees: number;
  byCycle: Record<string, { people: number; net: number }>;
};
type History = { periodKey: string; status: string };
type Payroll = { cycle: Cycle; people: Person[]; history: History[]; stubSms?: boolean };

function inr(amount: number) {
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function monthLabel(key: string) {
  return new Date(`${key}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export default function Payroll() {
  const [role, setRole] = useState("employee");
  const [data, setData] = useState<Payroll | null>(null);
  const [period, setPeriod] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [needOtp, setNeedOtp] = useState(false);
  const [devCode, setDevCode] = useState("");
  const [note, setNote] = useState("");

  const refresh = useCallback(async (next?: string) => {
    const session = await loadSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    setRole(session.user.role);
    const query = next || period;
    const body = await api<Payroll>(`/payroll${query ? `?period=${query}` : ""}`, {}, session.token);
    setData(body);
    setPeriod(body.cycle.periodKey);
  }, [period]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  const employee = role === "employee";
  const cycle = data?.cycle;
  const mine = data?.people[0];
  const selected = useMemo(() => (employee ? mine : null), [employee, mine]);

  async function download() {
    const session = await loadSession();
    if (!session || !period) return;
    setBusy(true);
    setError("");
    try {
      await sharePayrollPdf(session.token, period, employee ? selected?.employeeId : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not make the PDF");
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    const session = await loadSession();
    if (!session || !cycle) return;
    setBusy(true);
    setError("");
    try {
      const next = await api<Payroll>(`/payroll/cycles/${cycle.id}/approve`, { method: "POST", body: "{}" }, session.token);
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve");
    } finally {
      setBusy(false);
    }
  }

  async function sendOtp() {
    const session = await loadSession();
    if (!session || !cycle) return;
    setBusy(true);
    setError("");
    try {
      const otp = await api<{ devCode?: string }>(`/payroll/cycles/${cycle.id}/otp`, { method: "POST", body: "{}" }, session.token);
      setNeedOtp(true);
      setDevCode(otp.devCode ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send a code");
    } finally {
      setBusy(false);
    }
  }

  async function release() {
    const session = await loadSession();
    if (!session || !cycle) return;
    setBusy(true);
    setError("");
    try {
      const next = await api<Payroll>(`/payroll/cycles/${cycle.id}/release`, { method: "POST", body: JSON.stringify({ code }) }, session.token);
      setData(next);
      setNeedOtp(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not release");
    } finally {
      setBusy(false);
    }
  }

  async function queryHr() {
    const session = await loadSession();
    if (!session || !selected?.id) {
      setError("Approve the cycle first so this slip exists, then query HR.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/payroll/slips/${selected.id}/queries`, { method: "POST", body: JSON.stringify({ body: note }) }, session.token);
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenShell>
      <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <TopBar
          title={employee ? "My pay" : "Payroll"}
          subtitle={cycle ? monthLabel(cycle.periodKey) : "This month"}
          left={employee ? undefined : <BackBtn />}
          right={<IconBtn icon="download" onPress={() => void download()} />}
        />
        <View style={{ paddingHorizontal: 20, paddingTop: 4, gap: 12 }}>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {cycle ? (
            <View style={{ borderRadius: 20, overflow: "hidden", backgroundColor: colors.paper }}>
              <View style={{ backgroundColor: employee ? colors.ink : colors.green, padding: 18 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", opacity: 0.7, color: employee ? colors.paper : colors.ink }}>
                  {employee ? "Net pay" : cycle.status === "released" ? "Paid" : "Payout ready"}
                </Text>
                <Text style={{ fontSize: 36, fontWeight: "700", letterSpacing: -1, marginTop: 4, color: employee ? colors.paper : colors.ink }}>
                  {inr(employee && selected ? selected.net : cycle.payout)}
                </Text>
                <Text style={{ fontSize: 12, opacity: 0.8, marginTop: 4, color: employee ? colors.paper : colors.ink }}>
                  {employee && selected
                    ? `${selected.presentDays} days · ${cycle.from.slice(8)}–${cycle.to.slice(8)} ${monthLabel(cycle.periodKey)}`
                    : `${cycle.employees} employees · ${cycle.from} – ${cycle.to}`}
                </Text>
              </View>
              {!employee ? (
                <View style={{ flexDirection: "row", padding: 14, gap: 8 }}>
                  {cycle.status === "draft" ? (
                    <Pressable disabled={busy} onPress={() => void approve()} style={[styles.button, { flex: 1, marginTop: 0 }]}>
                      <Text style={styles.buttonText}>Review & approve</Text>
                    </Pressable>
                  ) : null}
                  {cycle.status === "approved" && !needOtp ? (
                    <Pressable disabled={busy} onPress={() => void sendOtp()} style={[styles.button, { flex: 1, marginTop: 0 }]}>
                      <Text style={styles.buttonText}>Release with OTP</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
              {needOtp ? (
                <View style={{ padding: 14, gap: 8 }}>
                  <TextInput value={code} onChangeText={setCode} placeholder="6-digit code" placeholderTextColor={colors.ink3} keyboardType="number-pad" style={styles.input} />
                  {devCode ? <Text style={styles.sub}>Dev code {devCode}</Text> : null}
                  <Pressable disabled={busy} onPress={() => void release()} style={styles.button}>
                    <Text style={styles.buttonText}>Confirm release</Text>
                  </Pressable>
                </View>
              ) : null}
              {employee && selected ? (
                <View style={{ padding: 18 }}>
                  {selected.lines.map((line) => (
                    <View key={line.name} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderStyle: "dashed", borderBottomColor: colors.cream2 }}>
                      <Text style={{ fontSize: 13, color: colors.ink3 }}>{line.name}</Text>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: line.kind === "deduction" ? colors.coral : colors.ink }}>
                        {line.kind === "deduction" ? "−" : ""}{inr(line.amount)}
                      </Text>
                    </View>
                  ))}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 12 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: colors.ink }}>Total</Text>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: colors.ink }}>{inr(selected.net)}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          {employee && selected ? (
            <View style={styles.card}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink }}>How this was calculated</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <Mini label="Days" value={String(selected.presentDays)} hint={`of ${selected.weekdays}`} />
                <Mini label="Hours" value={String(Math.round(selected.hours))} hint="h" />
                <Mini label="Check-ins" value={String(selected.checkins)} hint="done" />
              </View>
              <TextInput value={note} onChangeText={setNote} placeholder="Query HR if something is off" placeholderTextColor={colors.ink3} style={[styles.input, { marginTop: 12, marginBottom: 0 }]} />
              <Pressable disabled={busy} onPress={() => void queryHr()} style={[styles.button, styles.secondary, { marginTop: 10 }]}>
                <Text style={[styles.buttonText, styles.secondaryText]}>Send query</Text>
              </Pressable>
            </View>
          ) : null}

          {!employee && cycle ? (
            <>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink, paddingLeft: 4 }}>By payment cycle</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["daily", "weekly", "monthly"] as const).map((kind) => {
                  const row = cycle.byCycle[kind] ?? { people: 0, net: 0 };
                  const tint = kind === "daily" ? colors.amber : kind === "weekly" ? colors.green : colors.ink;
                  return (
                    <View key={kind} style={[styles.card, { flex: 1, padding: 14 }]}>
                      <Text style={{ fontSize: 11, color: colors.ink3, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase" }}>{kind}</Text>
                      <Text style={{ fontSize: 16, fontWeight: "700", marginTop: 6, color: tint }}>{inr(row.net)}</Text>
                      <Text style={{ fontSize: 10, color: colors.ink3, marginTop: 4 }}>{row.people} people</Text>
                    </View>
                  );
                })}
              </View>
              <View style={styles.card}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.ink3, letterSpacing: 0.6, textTransform: "uppercase" }}>How it flows</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 12 }}>
                  {["Attendance", "Hours", "Salary", "Payout"].map((step, index, arr) => (
                    <View key={step} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: index === arr.length - 1 ? colors.green : colors.cream }}>
                      <Text style={{ fontSize: 10, fontWeight: "600", textAlign: "center", color: colors.ink }}>{step}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View style={[styles.card, { padding: 0, overflow: "hidden" }]}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>Upcoming individual payouts</Text>
                {(data?.people ?? []).map((person) => (
                  <View key={person.employeeId} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.cream2 }}>
                    <Avatar name={person.person} size={34} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.ink }}>{person.person}</Text>
                      <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>
                        {person.missingTemplate ? "No template" : `${inr(person.net)} · ${person.cycle ?? ""} × ${person.presentDays}d`}
                      </Text>
                    </View>
                    <Icon name="chevronRight" size={16} color={colors.ink4} />
                  </View>
                ))}
              </View>
            </>
          ) : null}

          <View style={[styles.card, { padding: 0, overflow: "hidden" }]}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>History</Text>
            {(data?.history ?? []).filter((row) => row.periodKey !== period).map((row) => (
              <Pressable
                key={row.periodKey}
                onPress={() => void refresh(row.periodKey)}
                style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.cream2 }}
              >
                <Text style={{ fontSize: 13, color: colors.ink }}>{monthLabel(row.periodKey)}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ backgroundColor: colors.greenSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ color: colors.greenDeep, fontSize: 11, fontWeight: "700" }}>{row.status === "released" ? "Paid" : row.status}</Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

function Mini({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: colors.cream }}>
      <Text style={{ fontSize: 10, color: colors.ink3, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase" }}>{label}</Text>
      <Text style={{ fontSize: 18, fontWeight: "700", color: colors.ink, marginTop: 4 }}>{value}</Text>
      <Text style={{ fontSize: 10, color: colors.ink3, marginTop: 2 }}>{hint}</Text>
    </View>
  );
}
