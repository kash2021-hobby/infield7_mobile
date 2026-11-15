import { useCallback, useState } from "react";
import { Pressable, ScrollView, Share, Text, View } from "react-native";
import { router, useFocusEffect, type Href } from "expo-router";
import { api } from "@/api";
import { BackBtn, IconBtn, ScreenShell, TopBar } from "@/chrome";
import { AIMark } from "@/copilot-ui";
import { Icon, type IconName } from "@/icons";
import { loadSession } from "@/session";
import { colors, styles } from "@/theme";

type Item = {
  id: string;
  title: string;
  narrative: string;
  citation: string;
  suggestionTitle: string | null;
  status: string;
};
type Section = { id: string; label: string; body: string; cites: string[]; itemId: string | null };
type Brief = {
  paused?: boolean;
  weekNumber?: number;
  rangeLabel?: string;
  createdAt?: string | null;
  people?: number;
  sites?: number;
  memo?: { headline: string; sections: Section[] };
  items: Item[];
};

const sectionColor: Record<string, string> = {
  "on-track": colors.greenDeep,
  slipping: "#8A5A10",
  watch: colors.coral,
  do: colors.ink,
};

export default function WeeklyBriefing() {
  const [brief, setBrief] = useState<Brief | null>(null);
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
    setBrief(await api<Brief>("/brief", {}, session.token));
  }, []);

  useFocusEffect(
    useCallback(() => {
      setError("");
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  async function accept(id: string) {
    const session = await loadSession();
    if (!session) return;
    setError("");
    try {
      const result = await api<{ taskId?: string }>(`/brief/${id}/accept`, { method: "POST", body: "{}" }, session.token);
      if (result.taskId) {
        router.push(`/task/${result.taskId}`);
        return;
      }
      setNotice("Accepted. A task was created.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept");
    }
  }

  const memo = brief?.memo;
  const actions: { key: string; label: string; icon: IconName; onPress: () => void }[] = [];
  for (const item of brief?.items ?? []) {
    if (item.status === "pending" && item.suggestionTitle) {
      actions.push({ key: item.id, label: item.suggestionTitle, icon: "check", onPress: () => accept(item.id) });
    }
  }
  actions.push({ key: "alerts", label: "Open alerts", icon: "bell", onPress: () => router.push("/alerts" as Href) });
  actions.push({ key: "share", label: "Share brief with the team", icon: "message", onPress: () => void exportMemo() });

  async function exportMemo() {
    if (!memo) return;
    const text = [
      memo.headline,
      ...(memo.sections ?? []).map((section) => `${section.label}\n${section.body}\n${section.cites.join(" · ")}`),
    ].join("\n\n");
    try {
      await Share.share({ message: text, title: "InField weekly brief" });
    } catch {
      setNotice("Could not open the share sheet.");
    }
  }

  return (
    <ScreenShell>
      <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ paddingBottom: 24 }}>
        <TopBar
          title="Weekly brief"
          subtitle="Written for you"
          left={<BackBtn />}
          right={<IconBtn icon="download" onPress={() => void exportMemo()} />}
        />
        <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
          {error ? (
            <Text style={styles.error}>
              {error}
              {error.includes("Credits") ? " Open billing on the website." : ""}
            </Text>
          ) : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {!brief && !error ? <Text style={styles.sub}>Reading last week…</Text> : null}
          {brief?.paused ? <Text style={styles.sub}>Copilot is paused. Nothing is drafted until you turn it back on.</Text> : null}

          {brief && !brief.paused && memo ? (
            <>
              <View style={[styles.card, { padding: 0, overflow: "hidden" }]}>
                <View style={{ paddingHorizontal: 18, paddingVertical: 16, backgroundColor: colors.ink }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <AIMark size={20} color={colors.paper} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase" }}>
                        Week {brief.weekNumber ?? "—"} · InField brief
                      </Text>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: colors.paper, marginTop: 3, lineHeight: 20 }}>{memo.headline}</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 8 }}>
                    {brief.rangeLabel ?? "This week"} · cited counts · no invented score
                  </Text>
                </View>
                <View style={{ paddingHorizontal: 18, paddingBottom: 8 }}>
                  {(memo.sections ?? []).map((section, i) => (
                    <View
                      key={section.id}
                      style={{
                        paddingVertical: 14,
                        borderBottomWidth: i < (memo.sections?.length ?? 0) - 1 ? 1 : 0,
                        borderBottomColor: colors.cream2,
                        borderStyle: "dashed",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: "700",
                          letterSpacing: 0.8,
                          textTransform: "uppercase",
                          color: sectionColor[section.id] ?? colors.ink,
                        }}
                      >
                        {section.label}
                      </Text>
                      <Text style={{ fontSize: 13, color: colors.ink, marginTop: 6, lineHeight: 20 }}>{section.body}</Text>
                      {(section.cites ?? []).map((cite) => (
                        <Text key={cite} style={{ fontSize: 10, color: colors.ink3, marginTop: 6 }}>
                          ▸ {cite}
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
              </View>

              <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: colors.ink3, marginTop: 18, marginBottom: 8 }}>
                Turn it into action
              </Text>
              <View style={{ gap: 6 }}>
                {actions.map((action) => (
                  <Pressable
                    key={action.key}
                    onPress={action.onPress}
                    style={{
                      paddingVertical: 11,
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
                    <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.cream, alignItems: "center", justifyContent: "center" }}>
                      <Icon name={action.icon} size={14} color={colors.ink2} />
                    </View>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: colors.ink, flex: 1 }}>{action.label}</Text>
                    <Icon name="chevronRight" size={14} color={colors.ink3} />
                  </Pressable>
                ))}
              </View>

              <Text style={{ fontSize: 10, color: colors.ink3, textAlign: "center", marginTop: 16, lineHeight: 15 }}>
                Drafted from this week’s check-ins, tasks and alerts · every claim cites a source
              </Text>
            </>
          ) : null}
        </View>
      </ScrollView>
    </ScreenShell>
  );
}
