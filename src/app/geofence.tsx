import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { WebView, type NativeWebView, type WebViewMessageEvent } from "@/native-webview";
import { api } from "@/api";
import { BackBtn, ScreenShell, TopBar } from "@/chrome";
import { fenceHtml, type MapSite } from "@/mapHtml";
import { loadSession, type Session } from "@/session";
import { colors, styles } from "@/theme";

const minRadius = 30;
const maxRadius = 5000;
const marks = [100, 500, 1000, 2000, 5000];

type FenceSite = MapSite & { alertAfterMin?: number | null };
type Rule = {
  id: string;
  kind: string;
  status: string;
  enabled: boolean;
  notifyPerson: boolean;
  notifyManagers: boolean;
  minutesOver: number | null;
};

export default function WorkRadius() {
  const web = useRef<NativeWebView>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [sites, setSites] = useState<FenceSite[]>([]);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<number | null>(null);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [inside, setInside] = useState(0);
  const [outside, setOutside] = useState(0);
  const [alertAfter, setAlertAfter] = useState(30);
  const [notifyPerson, setNotifyPerson] = useState(true);
  const [notifyManagers, setNotifyManagers] = useState(true);
  const [ruleId, setRuleId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const current = await loadSession();
    if (!current) {
      router.replace("/login");
      return;
    }
    if (current.user.role === "employee") {
      router.replace("/check-in");
      return;
    }
    setSession(current);
    const [siteBody, rules] = await Promise.all([
      api<{ sites: FenceSite[] }>("/sites", {}, current.token),
      api<{ rules: Rule[] }>("/alert-rules", {}, current.token).catch(() => ({ rules: [] as Rule[] })),
    ]);
    setSites(siteBody.sites);
    setSiteId((currentId) => currentId ?? siteBody.sites[0]?.id ?? null);
    const geo = rules.rules.find((rule) => rule.kind === "geofence_exit" && rule.status === "published");
    if (geo) {
      setRuleId(geo.id);
      setNotifyPerson(geo.notifyPerson);
      setNotifyManagers(geo.notifyManagers);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  const site = sites.find((item) => item.id === siteId) ?? sites[0];
  const radius = draft ?? site?.radiusM ?? 150;

  useEffect(() => {
    if (!site) return;
    setAlertAfter(site.alertAfterMin ?? 30);
    setPin(null);
    setDraft(null);
  }, [site?.id]);

  useEffect(() => {
    web.current?.injectJavaScript(`window.setRadius && window.setRadius(${radius}); true;`);
  }, [radius, site?.id]);

  useEffect(() => {
    if (!session || !site) return;
    api<{ inside: number; outside: number }>(
      "/geofence/simulate",
      { method: "POST", body: JSON.stringify({ siteId: site.id, radiusM: radius }) },
      session.token,
    )
      .then((body) => {
        setInside(body.inside);
        setOutside(body.outside);
      })
      .catch(() => undefined);
  }, [session, site?.id, radius]);

  async function save() {
    if (!session || !site) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api(`/sites/${site.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          radiusM: radius,
          alertAfterMin: alertAfter,
          ...(pin ? { lat: pin.lat, lng: pin.lng } : {}),
        }),
      }, session.token);
      if (ruleId) {
        await api(`/alert-rules/${ruleId}/notify`, {
          method: "PATCH",
          body: JSON.stringify({ notifyPerson, notifyManagers }),
        }, session.token);
      }
      setDraft(null);
      setNotice(`Fence saved at ${radius} m. Check-in uses this radius now.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  function optionRow(label: string, value: string, tone: string, onPress?: () => void, on?: boolean) {
    return (
      <Pressable
        key={label}
        onPress={onPress}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderRadius: 14,
          backgroundColor: colors.cream,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: "500", color: colors.ink }}>{label}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: tone, fontFamily: "monospace" }}>{value}</Text>
          {on === undefined ? (
            <Text style={{ color: colors.ink3 }}>›</Text>
          ) : (
            <View style={{ width: 32, height: 18, borderRadius: 999, backgroundColor: on ? colors.green : colors.cream2, justifyContent: "center" }}>
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: colors.paper, marginLeft: on ? 16 : 2 }} />
            </View>
          )}
        </View>
      </Pressable>
    );
  }

  return (
    <ScreenShell>
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <TopBar title="Set work radius" subtitle={site ? site.name : "Add a site on the website"} left={<BackBtn />} />
      <View style={{ height: 360, backgroundColor: colors.cream2 }}>
        {site ? (
          <WebView
            ref={web}
            key={site.id}
            originWhitelist={["*"]}
            source={{ html: fenceHtml(site) }}
            onMessage={(event: WebViewMessageEvent) => {
              try {
                const payload = JSON.parse(event.nativeEvent.data) as { type?: string; lat?: number; lng?: number };
                if (payload.type === "pin" && payload.lat && payload.lng) setPin({ lat: payload.lat, lng: payload.lng });
              } catch {
                undefined;
              }
            }}
            onLoadEnd={() => web.current?.injectJavaScript(`window.setRadius && window.setRadius(${radius}); true;`)}
          />
        ) : null}
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {sites.length === 0 ? <Text style={styles.sub}>Add a site on the website, then set its radius here.</Text> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginBottom: 16 }}>
          {sites.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => {
                setSiteId(item.id);
                setDraft(null);
                setNotice("");
              }}
              style={{ backgroundColor: item.id === site?.id ? colors.ink : colors.paper, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.cream2 }}
            >
              <Text style={{ color: item.id === site?.id ? colors.paper : colors.ink, fontWeight: "600", fontSize: 13 }}>{item.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {site ? (
          <>
            <Text style={{ fontSize: 12, color: colors.ink3, marginBottom: 12 }}>
              {inside} inside · {outside} outside right now
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Latitude</Text>
                <TextInput
                  keyboardType="decimal-pad"
                  value={String(pin?.lat ?? site.lat)}
                  onChangeText={(raw) => {
                    const next = Number(raw);
                    if (!Number.isFinite(next)) return;
                    const lng = pin?.lng ?? site.lng;
                    setPin({ lat: next, lng });
                    web.current?.injectJavaScript(`window.setPin && window.setPin(${next}, ${lng}); true;`);
                  }}
                  style={[styles.input, { fontFamily: "monospace" }]}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Longitude</Text>
                <TextInput
                  keyboardType="decimal-pad"
                  value={String(pin?.lng ?? site.lng)}
                  onChangeText={(raw) => {
                    const next = Number(raw);
                    if (!Number.isFinite(next)) return;
                    const lat = pin?.lat ?? site.lat;
                    setPin({ lat, lng: next });
                    web.current?.injectJavaScript(`window.setPin && window.setPin(${lat}, ${next}); true;`);
                  }}
                  style={[styles.input, { fontFamily: "monospace" }]}
                />
              </View>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.ink }}>Radius</Text>
              <Text style={{ fontSize: 22, fontWeight: "700", color: colors.ink }}>{radius} m</Text>
            </View>
            <RadiusSlider value={radius} onChange={(next) => { setDraft(next); setNotice(""); }} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
              {marks.map((mark) => (
                <Pressable key={mark} onPress={() => { setDraft(mark); setNotice(""); }}>
                  <Text style={{ fontSize: 10, color: colors.ink3 }}>{mark >= 1000 ? `${mark / 1000} km` : `${mark} m`}</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ marginTop: 22, gap: 8 }}>
              {optionRow("Alert if outside for", `${alertAfter} min`, colors.amber, () => {
                const next = alertAfter === 30 ? 15 : alertAfter === 15 ? 60 : 30;
                setAlertAfter(next);
              })}
              {optionRow("Auto-resume on return", "Off this product", colors.ink3)}
              {optionRow("Notify employee", notifyPerson ? "On" : "Off", notifyPerson ? colors.green : colors.ink3, () => setNotifyPerson((value) => !value), notifyPerson)}
              {optionRow("Notify manager", notifyManagers ? "On" : "Off", notifyManagers ? colors.green : colors.ink3, () => setNotifyManagers((value) => !value), notifyManagers)}
            </View>
            <Pressable onPress={save} disabled={saving} style={[styles.button, { marginTop: 18, borderRadius: 14 }]}>
              <Text style={styles.buttonText}>{saving ? "Saving…" : "Save geofence"}</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </View>
    </ScreenShell>
  );
}

function RadiusSlider({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  const [width, setWidth] = useState(1);
  const ratio = (value - minRadius) / (maxRadius - minRadius);

  function fromX(x: number) {
    const nextRatio = Math.min(1, Math.max(0, x / width));
    const raw = minRadius + nextRatio * (maxRadius - minRadius);
    const stepped = Math.round(raw / 10) * 10;
    onChange(Math.min(maxRadius, Math.max(minRadius, stepped)));
  }

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(event) => fromX(event.nativeEvent.locationX)}
      onResponderMove={(event) => fromX(event.nativeEvent.locationX)}
      style={{ height: 32, justifyContent: "center", marginTop: 6 }}
    >
      <View style={{ height: 4, borderRadius: 999, backgroundColor: colors.cream2 }} />
      <View style={{ position: "absolute", left: 0, width: Math.max(ratio * width, 0), height: 4, borderRadius: 999, backgroundColor: colors.green }} />
      <View style={{ position: "absolute", left: Math.min(Math.max(ratio * width - 10, 0), width - 20), width: 20, height: 20, borderRadius: 10, backgroundColor: colors.paper, borderWidth: 3, borderColor: colors.green }} />
    </View>
  );
}
