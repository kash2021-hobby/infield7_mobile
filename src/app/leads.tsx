import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { api } from "@/api";
import { Avatar, BackBtn, FilterChip, ScreenShell, TopBar } from "@/chrome";
import { loadSession, type Session } from "@/session";
import { colors, styles } from "@/theme";

type Lead = {
  id: string;
  name: string;
  phone: string;
  city: string;
  source: string;
  status: string;
  assignee: string | null;
  remindOn: string | null;
};

type Stats = { new: number; follow_up: number; converted: number; cold: number; all: number };

function statusLabel(status: string) {
  if (status === "new") return "New";
  if (status === "follow_up") return "Follow-up";
  if (status === "converted") return "Converted";
  if (status === "cold") return "Cold";
  return status;
}

function statusColor(status: string) {
  if (status === "converted") return colors.greenDeep;
  if (status === "follow_up" || status === "new") return colors.amber;
  return colors.ink3;
}

export default function LeadsScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<Stats>({ new: 0, follow_up: 0, converted: 0, cold: 0, all: 0 });
  const [filter, setFilter] = useState("new");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async (status = filter, search = q) => {
    const current = await loadSession();
    if (!current) return;
    setSession(current);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (search.trim()) params.set("q", search.trim());
    const body = await api<{ leads: Lead[]; stats: Stats }>(`/leads?${params.toString()}`, {}, current.token);
    setLeads(body.leads);
    setStats(body.stats);
  }, [filter, q]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load leads"));
    }, [refresh]),
  );

  return (
    <ScreenShell>
      <TopBar title="Leads" subtitle={session?.user.role === "employee" ? "Assigned to you" : "From the Google Sheet"} left={<BackBtn />} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 20, paddingBottom: 8 }}>
        {([
          ["new", "New", stats.new],
          ["follow_up", "Follow-up", stats.follow_up],
          ["converted", "Converted", stats.converted],
          ["cold", "Cold", stats.cold],
          ["", "All", stats.all],
        ] as const).map(([id, label, count]) => (
          <FilterChip
            key={id || "all"}
            label={`${label} ${count}`}
            active={filter === id}
            onPress={() => {
              setFilter(id);
              refresh(id, q).catch(() => undefined);
            }}
          />
        ))}
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 8, flexDirection: "row", gap: 8 }}>
        <TextInput
          value={qInput}
          onChangeText={setQInput}
          placeholder="Search name, phone, city"
          placeholderTextColor={colors.ink3}
          style={[styles.input, { flex: 1, marginBottom: 0 }]}
          returnKeyType="search"
          onSubmitEditing={() => {
            setQ(qInput.trim());
            refresh(filter, qInput.trim()).catch(() => undefined);
          }}
        />
        <Pressable
          onPress={() => {
            setQ(qInput.trim());
            refresh(filter, qInput.trim()).catch(() => undefined);
          }}
          style={[styles.button, { marginTop: 0, paddingHorizontal: 16 }]}
        >
          <Text style={styles.buttonText}>Search</Text>
        </Pressable>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        {error ? <Text style={{ color: colors.coral, marginBottom: 12 }}>{error}</Text> : null}
        {leads.length === 0 ? (
          <View style={styles.card}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.ink }}>No leads here</Text>
            <Text style={[styles.sub, { marginBottom: 0 }]}>
              {session?.user.role === "employee"
                ? "When an admin assigns a lead to you, it shows up here and as a notification."
                : "Connect a Google Sheet on the web Leads page."}
            </Text>
          </View>
        ) : leads.map((lead) => (
          <Pressable key={lead.id} onPress={() => router.push(`/lead/${lead.id}`)} style={[styles.card, { flexDirection: "row", gap: 12, alignItems: "center" }]}>
            <Avatar name={lead.name} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.ink }}>{lead.name}</Text>
              <Text style={{ fontSize: 13, color: colors.ink2, marginTop: 2 }}>
                {lead.phone || "No phone"}
                {lead.city ? ` · ${lead.city}` : ""}
              </Text>
              <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>
                {lead.assignee ? lead.assignee : "Unassigned"}
                {lead.remindOn ? ` · call ${lead.remindOn}` : ""}
              </Text>
            </View>
            <Text style={{ fontSize: 12, fontWeight: "700", color: statusColor(lead.status) }}>{statusLabel(lead.status)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </ScreenShell>
  );
}
