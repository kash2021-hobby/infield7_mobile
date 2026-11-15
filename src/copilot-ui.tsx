import { type ReactNode } from "react";
import { Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { colors } from "@/theme";

export type Tone = "coral" | "amber" | "green" | "ink";

export function AIMark({ size = 22, color = colors.paper }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22">
      <Rect x="2" y="2" width="18" height="18" rx="5" fill="none" stroke={color} strokeWidth="1.6" opacity={0.35} />
      <Rect x="6" y="6" width="10" height="10" rx="3" fill="none" stroke={color} strokeWidth="1.6" opacity={0.7} />
      <Rect x="9" y="9" width="4" height="4" rx="1" fill={color} />
    </Svg>
  );
}

export function Chip({ tone, children }: { tone: Tone; children: string }) {
  const map = {
    coral: { color: colors.coral, background: colors.coralSoft },
    amber: { color: "#8A5A10", background: colors.amberSoft },
    green: { color: colors.greenDeep, background: colors.greenSoft },
    ink: { color: colors.ink, background: colors.cream },
  }[tone];
  return (
    <View style={{ backgroundColor: map.background, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ color: map.color, fontSize: 11, fontWeight: "700" }}>{children}</Text>
    </View>
  );
}

export function Kicker({ children, inset = 0 }: { children: ReactNode; inset?: number }) {
  return (
    <View style={{ paddingHorizontal: inset, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: colors.ink3 }}>
        {children}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.cream2 }} />
    </View>
  );
}

export function FooterNote({ children }: { children: string }) {
  return (
    <View
      style={{
        padding: 10,
        borderRadius: 10,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: colors.ink4,
        flexDirection: "row",
        gap: 10,
        alignItems: "center",
      }}
    >
      <AIMark size={16} color={colors.ink3} />
      <Text style={{ fontSize: 10, color: colors.ink3, lineHeight: 15, flex: 1 }}>{children}</Text>
    </View>
  );
}

export function Sparkline({ data, width, height, color = colors.coral }: { data: number[]; width: number; height: number; color?: string }) {
  if (data.length < 2) {
    return <Text style={{ fontSize: 12, color: colors.ink3 }}>Not enough days yet for a trend.</Text>;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data.map((value, i) => {
    const x = i * step;
    const y = height - ((value - min) / range) * (height - 8) - 4;
    return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  const d = pts.join(" ");
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Path d={`${d} L ${width} ${height} L 0 ${height} Z`} fill={color} opacity={0.08} />
      <Path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function accentFor(tone: Tone) {
  if (tone === "coral") return colors.coral;
  if (tone === "amber") return colors.amber;
  if (tone === "green") return colors.green;
  return colors.ink;
}

export function toneFor(item: { title: string; suggestionTitle?: string | null; tone?: string; label?: string }): { tone: Tone; label: string } {
  if (item.tone === "coral" || item.tone === "amber" || item.tone === "green" || item.tone === "ink") {
    return { tone: item.tone, label: item.label ?? (item.tone === "coral" ? "Gap detected" : item.tone === "amber" ? "Risk forecast" : item.tone === "green" ? "Optimization" : "Coaching moment") };
  }
  if (/late/i.test(item.title)) return { tone: "coral", label: "Gap detected" };
  if (/alert/i.test(item.title)) return { tone: "amber", label: "Risk forecast" };
  if (item.suggestionTitle) return { tone: "green", label: "Optimization" };
  return { tone: "ink", label: "Coaching moment" };
}
