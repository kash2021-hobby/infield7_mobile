import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { api } from "@/api";
import { homeHref, loadPending, needsWelcome, savePending, saveSession, type Session } from "@/session";
import { colors, styles } from "@/theme";

export default function Verify() {
  const [code, setCode] = useState("");
  const [invite, setInvite] = useState("");
  const [intent, setIntent] = useState<"login" | "register">("login");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("+91");
  const [devCode, setDevCode] = useState("");
  const [wait, setWait] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadPending().then((pending) => {
      if (!pending) return;
      setPhone(pending.phone);
      setCountry(pending.country);
      setDevCode(pending.devCode ?? "");
      if (pending.devCode) setCode(pending.devCode);
      if (pending.invite) setInvite(pending.invite);
      setIntent(pending.intent === "register" ? "register" : "login");
    });
  }, []);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function resend() {
    if (wait > 0 || !phone) return;
    setError("");
    try {
      const result = await api<{ devCode?: string }>("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ phone, country_code: country, intent }),
      });
      await savePending({
        phone,
        country,
        devCode: result.devCode,
        invite: intent === "login" ? invite.trim() || undefined : undefined,
        intent,
      });
      setDevCode(result.devCode ?? "");
      if (result.devCode) setCode(result.devCode);
      setWait(30);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend");
    }
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const session = await api<Session>("/auth/verify", {
        method: "POST",
        body: JSON.stringify({
          phone,
          country_code: country,
          code,
          invite_code: intent === "login" ? invite.trim() || undefined : undefined,
          intent,
        }),
      });
      await saveSession(session);
      if (await needsWelcome(session.user.id)) router.replace("/welcome");
      else router.replace(homeHref(session));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.cream }} behavior="padding" keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}>
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <Text style={styles.title}>Enter the code</Text>
      <Text style={styles.sub}>
        {intent === "register" ? "Creating a company. " : ""}Sent to {country} {phone || "your phone"}.
      </Text>
      {devCode ? <Text style={styles.notice}>Development code {devCode}. No SMS was sent.</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.label}>6-digit code</Text>
      <TextInput
        style={styles.input}
        value={code}
        onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        placeholder="000000"
        placeholderTextColor={colors.ink3}
      />
      {intent === "login" ? (
        <>
          <Text style={styles.label}>Invite code</Text>
          <TextInput
            style={styles.input}
            value={invite}
            onChangeText={setInvite}
            autoCapitalize="characters"
            placeholder="Only if a manager sent one"
            placeholderTextColor={colors.ink3}
          />
        </>
      ) : null}
      <Pressable style={styles.button} disabled={busy || code.length !== 6} onPress={submit}>
        <Text style={styles.buttonText}>{busy ? "Checking" : intent === "register" ? "Create company" : "Sign in"}</Text>
      </Pressable>
      <Pressable style={[styles.button, styles.secondary]} disabled={wait > 0 || !phone} onPress={resend}>
        <Text style={[styles.buttonText, styles.secondaryText]}>{wait > 0 ? `Resend in ${wait}s` : "Resend code"}</Text>
      </Pressable>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}
