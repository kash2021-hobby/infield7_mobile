import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors } from "@/theme";

function toBase64(value: string) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes = unescape(encodeURIComponent(value));
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes.charCodeAt(i);
    const b = i + 1 < bytes.length ? bytes.charCodeAt(i + 1) : NaN;
    const c = i + 2 < bytes.length ? bytes.charCodeAt(i + 2) : NaN;
    const triplet = (a << 16) | ((Number.isNaN(b) ? 0 : b) << 8) | (Number.isNaN(c) ? 0 : c);
    out += chars[(triplet >> 18) & 63] + chars[(triplet >> 12) & 63];
    out += Number.isNaN(b) ? "=" : chars[(triplet >> 6) & 63];
    out += Number.isNaN(c) ? "=" : chars[triplet & 63];
  }
  return out;
}

type Point = { x: number; y: number };
type Stroke = Point[];

function pathOf(stroke: Stroke) {
  if (!stroke.length) return "";
  return stroke.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
}

function svgOf(strokes: Stroke[], width: number, height: number) {
  const d = strokes.map(pathOf).filter(Boolean).join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path d="${d}" fill="none" stroke="#1C2430" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState<Stroke>([]);
  const width = 320;
  const height = 140;

  function emit(next: Stroke[]) {
    if (!next.length) {
      onChange(null);
      return;
    }
    const svg = svgOf(next, width, height);
    onChange(`data:image/svg+xml;base64,${toBase64(svg)}`);
  }

  const shown = useMemo(() => (current.length ? [...strokes, current] : strokes), [strokes, current]);

  return (
    <View>
      <View
        style={{ height, borderRadius: 12, borderWidth: 1, borderColor: colors.cream2, backgroundColor: colors.cream, overflow: "hidden" }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => {
          const { locationX, locationY } = e.nativeEvent;
          setCurrent([{ x: locationX, y: locationY }]);
        }}
        onResponderMove={(e) => {
          const { locationX, locationY } = e.nativeEvent;
          setCurrent((cur) => [...cur, { x: locationX, y: locationY }]);
        }}
        onResponderRelease={() => {
          setStrokes((cur) => {
            const next = current.length ? [...cur, current] : cur;
            emit(next);
            return next;
          });
          setCurrent([]);
        }}
      >
        <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}>
          {shown.map((stroke, i) => (
            <Path key={i} d={pathOf(stroke)} fill="none" stroke={colors.ink} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </Svg>
      </View>
      <Pressable
        onPress={() => {
          setStrokes([]);
          setCurrent([]);
          onChange(null);
        }}
        style={{ alignSelf: "flex-start", marginTop: 8 }}
      >
        <Text style={{ fontSize: 12, color: colors.ink3, fontWeight: "600" }}>Clear signature</Text>
      </Pressable>
    </View>
  );
}
