import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { api } from "@/api";
import { BackBtn, FilterChip, IconBtn, ScreenShell, TopBar } from "@/chrome";
import { AIMark } from "@/copilot-ui";
import { Icon } from "@/icons";
import { loadSession } from "@/session";
import { colors, styles } from "@/theme";

type Item = {
  id: string;
  title: string;
  narrative: string;
  citation: string;
  status: string;
  helpful?: boolean | null;
};

const filters = ["All", "People", "Routes", "Customers", "Timing"] as const;

export default function PatternLibrary() {
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const session = await loadSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    if (session.user.role === "employee") {
      router.replace("/check-in");
      return;
    }
    const brief = await api<{ items: Item[] }>("/brief", {}, session.token);
    setItems(brief.items ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setError("");
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  async function vote(id: string, helpful: boolean) {
    const session = await loadSession();
    if (!session) return;
    try {
      await api(`/brief/${id}/feedback`, { method: "POST", body: JSON.stringify({ helpful }) }, session.token);
      setItems((current) => current.map((item) => (item.id === id ? { ...item, helpful } : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save feedback");
    }
  }

  const pending = items.filter((item) => item.status === "pending");
  const dismissed = items.filter((item) => item.status === "dismissed");
  const heldOff = filter === "Routes" || filter === "Customers";
  const shown = heldOff ? [] : filter === "People" || filter === "Timing" ? pending : items;

  return (
    <ScreenShell>
      <TopBar
        title="What the AI has learned"
        subtitle="Patterns from your team's data"
        left={<BackBtn />}
        right={<IconBtn icon="search" onPress={() => undefined} />}
      />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.card}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <AIMark size={18} color={colors.ink2} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.ink }}>
                  {items.length} notes this week · {pending.length} still open
                </Text>
                <Text style={{ fontSize: 10, color: colors.ink3, marginTop: 2, lineHeight: 14 }}>
                  Months-long invented scores stay off. Your yes/no trains what stays.
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 4, marginTop: 12 }}>
              {[
                { label: "Strong", n: pending.length, color: colors.greenDeep, flex: Math.max(pending.length, 1) },
                { label: "Emerging", n: items.length - pending.length - dismissed.length, color: colors.green, flex: 1 },
                { label: "Weak", n: dismissed.length, color: colors.amber, flex: Math.max(dismissed.length, 1) },
                { label: "Rejected", n: 0, color: colors.cream2, flex: 1 },
              ].map((band) => (
                <View key={band.label} style={{ flex: band.flex, alignItems: "center" }}>
                  <View style={{ height: 6, alignSelf: "stretch", backgroundColor: band.color, borderRadius: 3 }} />
                  <Text style={{ fontSize: 9, color: colors.ink3, marginTop: 4, fontWeight: "600" }}>
                    {band.label} · {band.n}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 6, paddingBottom: 10 }}>
          {filters.map((label) => (
            <FilterChip
              key={label}
              label={label === "All" ? `All ${items.length}` : label}
              active={filter === label}
              onPress={() => setFilter(label)}
            />
          ))}
        </ScrollView>

        <View style={{ paddingHorizontal: 16, gap: 8 }}>
          {heldOff ? (
            <View style={styles.card}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink }}>Off this product</Text>
              <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 6, lineHeight: 18 }}>
                Route and customer history scores are not generated. The weekly brief only cites this week’s check-ins, tasks, and alerts.
              </Text>
            </View>
          ) : null}
          {!heldOff && shown.length === 0 ? <Text style={styles.sub}>No cited notes in this bucket yet.</Text> : null}
          {shown.map((item) => (
            <Pressable key={item.id} onPress={() => router.push(`/copilot/${item.id}`)} style={[styles.card, { marginBottom: 0 }]}>
              <Text style={{ fontSize: 12, fontWeight: "600", lineHeight: 18, color: colors.ink }}>&ldquo;{item.title}&rdquo;</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <View style={{ height: 4, borderRadius: 3, backgroundColor: colors.cream2, overflow: "hidden" }}>
                    <View
                      style={{
                        width: "100%",
                        height: "100%",
                        backgroundColor: item.status === "pending" ? colors.greenDeep : colors.amber,
                        opacity: item.status === "pending" ? 1 : 0.45,
                      }}
                    />
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                    <Text style={{ fontSize: 9, color: colors.ink3 }}>{item.status} · no invented score</Text>
                    <Text style={{ fontSize: 9, color: colors.ink3 }}>{item.citation} · this week</Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: 4 }}>
                  <Pressable
                    onPress={() => vote(item.id, true)}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: item.helpful === true ? colors.green : colors.cream2,
                      backgroundColor: colors.paper,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="check" size={14} color={colors.greenDeep} />
                  </Pressable>
                  <Pressable
                    onPress={() => vote(item.id, false)}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: item.helpful === false ? colors.coral : colors.cream2,
                      backgroundColor: colors.paper,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="close" size={14} color={colors.coral} />
                  </Pressable>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </ScreenShell>
  );
}
