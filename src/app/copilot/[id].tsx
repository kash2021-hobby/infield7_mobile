import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams, type Href } from "expo-router";
import { api } from "@/api";
import { BackBtn, IconBtn, ScreenShell, TopBar } from "@/chrome";
import { Chip, FooterNote, Kicker, Sparkline, accentFor, toneFor } from "@/copilot-ui";
import { Icon } from "@/icons";
import { loadSession } from "@/session";
import { colors, styles } from "@/theme";

type Item = {
  id: string;
  title: string;
  narrative: string;
  citation: string;
  suggestionTitle: string | null;
  status: string;
  tone?: string;
  label?: string;
};

type Evidence = {
  item: Item;
  sources: { label: string; snippet: string }[];
  series: number[];
  heatmap: number[][];
  hours: string[];
  days: string[];
  chain: string[];
};

export default function InsightDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const [data, setData] = useState<Evidence | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
    setData(await api<Evidence>(`/brief/items/${id}`, {}, session.token));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      setError("");
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  async function act(action: "accept" | "dismiss") {
    const session = await loadSession();
    if (!session || !data) return;
    setError("");
    try {
      const result = await api<{ taskId?: string }>(`/brief/${data.item.id}/${action}`, { method: "POST", body: "{}" }, session.token);
      if (action === "accept") {
        setNotice("Accepted. A task was created.");
        if (result.taskId) {
          router.replace(`/task/${result.taskId}`);
          return;
        }
      } else {
        setNotice("Dismissed. Nothing else changed.");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update");
    }
  }

  const item = data?.item ?? null;
  const tone = item ? toneFor(item) : null;
  const series = data?.series ?? [];
  const last = series.length ? series[series.length - 1] : null;
  const first = series.length ? series[0] : null;
  const delta = last != null && first != null ? last - first : null;
  const maxHeat = data ? Math.max(1, ...data.heatmap.flat()) : 1;
  const sparkW = Math.max(240, width - 72);
  const cluster = (() => {
    if (!data) return "";
    let best = { day: "", hour: "", n: 0 };
    data.days.forEach((day, r) => {
      data.hours.forEach((hour, c) => {
        const n = data.heatmap[r]?.[c] ?? 0;
        if (n > best.n) best = { day, hour, n };
      });
    });
    return best.n ? `Concentrated on ${best.day}, ${best.hour} — ${best.n} late check-in${best.n === 1 ? "" : "s"} in that bucket.` : "No late-afternoon cluster in the last eight weeks.";
  })();

  return (
    <ScreenShell>
      <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ paddingBottom: 24 }}>
        <TopBar
          title="Gap analysis"
          subtitle={item?.citation ?? "Cited from this week"}
          left={<BackBtn />}
          right={<IconBtn icon="message" onPress={() => router.push("/alerts" as Href)} />}
        />
        <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {item && tone ? (
            <>
              <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: accentFor(tone.tone) }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Chip tone={tone.tone}>{tone.label}</Chip>
                  <Text style={{ fontSize: 10, color: colors.ink3 }}>{item.citation}</Text>
                </View>
                <Text style={{ fontSize: 15, fontWeight: "700", color: colors.ink, lineHeight: 20 }}>{item.title}</Text>
                <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 6, lineHeight: 16 }}>{item.narrative}</Text>
              </View>

              <Kicker>Evidence · on-time trend</Kicker>
              <View style={styles.card}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                  <View>
                    <Text style={{ fontSize: 22, fontWeight: "700", color: colors.ink, letterSpacing: -0.4 }}>{last != null ? `${last}%` : "—"}</Text>
                    <Text style={{ fontSize: 10, color: colors.ink3 }}>on-time this counted week</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: delta != null && delta < 0 ? colors.coral : colors.greenDeep }}>
                      {delta == null ? "No delta yet" : `${delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} ${Math.abs(delta)} pts`}
                    </Text>
                    <Text style={{ fontSize: 10, color: colors.ink3 }}>vs first counted day</Text>
                  </View>
                </View>
                <Sparkline data={series} width={sparkW} height={64} color={colors.coral} />
                <Text style={{ fontSize: 9, color: colors.ink3, marginTop: 4 }}>Last {series.length || 0} counted days · empty days omitted</Text>
              </View>

              <Kicker>Pattern · where it clusters</Kicker>
              <View style={styles.card}>
                <View style={{ flexDirection: "row", marginBottom: 4 }}>
                  <View style={{ width: 36 }} />
                  {(data?.hours ?? []).map((hour) => (
                    <Text key={hour} style={{ flex: 1, fontSize: 9, color: colors.ink3, textAlign: "center" }}>
                      {hour}
                    </Text>
                  ))}
                </View>
                {(data?.days ?? []).map((day, r) => (
                  <View key={day} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
                    <Text style={{ width: 32, fontSize: 10, fontWeight: "600", color: colors.ink3 }}>{day}</Text>
                    {(data?.heatmap[r] ?? []).map((n, c) => {
                      const v = n / maxHeat;
                      return (
                        <View
                          key={`${day}-${c}`}
                          style={{
                            flex: 1,
                            height: 26,
                            borderRadius: 4,
                            backgroundColor: `rgba(212, 83, 62, ${0.08 + v * 0.72})`,
                            borderWidth: v > 0.7 ? 1.5 : 1,
                            borderColor: v > 0.7 ? colors.coral : colors.cream2,
                          }}
                        />
                      );
                    })}
                  </View>
                ))}
                <Text style={{ fontSize: 10, color: colors.ink3, marginTop: 10, lineHeight: 15 }}>{cluster}</Text>
              </View>

              <Kicker>Contributing signals</Kicker>
              <View style={{ gap: 6, marginBottom: 12 }}>
                {(data?.chain ?? []).map((sig, i) => (
                  <View
                    key={sig}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                      backgroundColor: colors.paper,
                      borderWidth: 1,
                      borderColor: colors.cream2,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.amber }} />
                    <Text style={{ fontSize: 12, color: colors.ink, flex: 1 }}>{sig}</Text>
                    <Text style={{ fontSize: 10, color: colors.ink3 }}>{i === 0 ? item.citation : "this week"}</Text>
                  </View>
                ))}
              </View>

              <Kicker>Suggested actions · pick one</Kicker>
              <View style={{ gap: 8, marginBottom: 12 }}>
                {[
                  item.suggestionTitle && item.status === "pending"
                    ? { key: "accept", title: item.suggestionTitle, sub: "Creates a normal task · you confirm", onPress: () => act("accept") }
                    : null,
                  { key: "attend", title: "Open this week’s attendance", sub: "Same source as the on-time chart", onPress: () => router.push("/attendance" as Href) },
                  { key: "opt", title: "Reassign an afternoon slot", sub: "Resource optimization stays off this product", onPress: () => router.push("/copilot/optimize") },
                ]
                  .filter((row): row is { key: string; title: string; sub: string; onPress: () => void } => Boolean(row))
                  .map((row, i) => (
                    <Pressable key={row.key} onPress={row.onPress} style={[styles.card, { marginBottom: 0 }]}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <View
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 13,
                            backgroundColor: colors.cream,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.ink }}>{i + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.ink }}>{row.title}</Text>
                          <Text style={{ fontSize: 10, color: colors.ink3, marginTop: 2 }}>{row.sub}</Text>
                        </View>
                        <Icon name="chevronRight" size={14} color={colors.ink3} />
                      </View>
                    </Pressable>
                  ))}
              </View>

              {item.status === "pending" ? (
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                  <Pressable onPress={() => act("dismiss")} style={[styles.button, styles.secondary, { flex: 1, marginTop: 0 }]}>
                    <Text style={[styles.buttonText, styles.secondaryText]}>Dismiss</Text>
                  </Pressable>
                  {item.suggestionTitle ? (
                    <Pressable onPress={() => act("accept")} style={[styles.button, { flex: 1, marginTop: 0 }]}>
                      <Text style={styles.buttonText}>Accept</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              <FooterNote>This is a suggestion, not an action. Nothing changes until you approve it.</FooterNote>
            </>
          ) : null}
        </View>
      </ScrollView>
    </ScreenShell>
  );
}
