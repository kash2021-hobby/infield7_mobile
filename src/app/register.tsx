import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Redirect, router, useFocusEffect } from "expo-router";
import { api } from "@/api";
import { BrandWordmark, RadarHero } from "@/brand";
import { homeHref, loadSession, savePending } from "@/session";
import { colors, styles } from "@/theme";

export default function Register() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [home, setHome] = useState<"/check-in" | "/overview">("/overview");
  const [country, setCountry] = useState("+91");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setReady(false);
      loadSession()
        .then((session) => {
          if (session) {
            setHome(homeHref(session));
            setSignedIn(true);
            return;
          }
          setSignedIn(false);
        })
        .finally(() => setReady(true));
    }, []),
  );

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ devCode?: string }>("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ phone, country_code: country, intent: "register" }),
      });
      await savePending({ phone, country, devCode: result.devCode, intent: "register" });
      router.push("/verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the code");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.cream }} />;
  if (signedIn) return <Redirect href={home} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.cream }} behavior="padding" keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}>
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={{ paddingTop: 28, paddingHorizontal: 24, paddingBottom: 28, alignItems: "center", backgroundColor: colors.greenSoft }}>
          <BrandWordmark />
          <RadarHero />
          <Text style={{ fontSize: 26, fontWeight: "700", color: colors.ink, letterSpacing: -0.6, textAlign: "center", lineHeight: 30 }}>
            Start your company{"\n"}on InField 7.
          </Text>
          <Text style={{ fontSize: 14, color: colors.ink3, marginTop: 10, textAlign: "center", lineHeight: 20, maxWidth: 300 }}>
            A new phone number creates a workspace. Invited people should sign in instead.
          </Text>
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: -16 }}>
          <View style={[styles.card, { padding: 20 }]}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink, marginBottom: 14 }}>Create a company</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={[styles.row, { marginBottom: 10 }]}>
              <TextInput
                style={[styles.input, { width: 72, marginBottom: 0, backgroundColor: colors.cream }]}
                value={country}
                onChangeText={setCountry}
                keyboardType="phone-pad"
              />
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0, backgroundColor: colors.cream }]}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="98765 43210"
                placeholderTextColor={colors.ink3}
                autoComplete="tel"
              />
            </View>
            <Pressable style={[styles.button, { marginTop: 4, borderRadius: 14 }]} disabled={busy || phone.trim().length < 8} onPress={submit}>
              <Text style={styles.buttonText}>{busy ? "Sending" : "Send OTP"}</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => router.replace("/login")} style={{ marginTop: 16 }}>
            <Text style={{ textAlign: "center", fontSize: 14, color: colors.ink3, lineHeight: 20 }}>
              Already have an account? <Text style={{ color: colors.ink, fontWeight: "600" }}>Sign in</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
