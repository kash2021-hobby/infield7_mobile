import { useCallback, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, type Href } from "expo-router";
import { api, ApiError } from "@/api";
import { stopBackground } from "@/background";
import { Avatar, IconBtn, MenuRow, ScreenShell, TopBar } from "@/chrome";
import { Icon, type IconName } from "@/icons";
import { stopPresence } from "@/presence";
import { registerPush, unregisterPush, type PushState } from "@/push";
import { leaveSession, loadSession, type Session } from "@/session";
import { colors, styles } from "@/theme";

type Link = { label: string; hint: string; href: Href; icon: IconName };

type PushInfo = { devices: number; recent: { title: string; body: string; status: string; sentAt: string }[] };

const managerLinks: Link[] = [
  { label: "On duty now", hint: "Who is in, who is not, who left", href: "/on-duty", icon: "users" },
  { label: "AI copilot", hint: "Quiet analyst · today's insights", href: "/copilot", icon: "search" },
  { label: "What the AI has learned", hint: "This week's cited notes, not invented history", href: "/copilot/patterns", icon: "target" },
  { label: "Weekly brief", hint: "Last seven days in one story", href: "/copilot/briefing", icon: "calendar" },
  { label: "Set work radius", hint: "Site fence, drag pin or pinch the ring", href: "/geofence", icon: "pin" },
  { label: "Attendance", hint: "This week's check-ins", href: "/attendance", icon: "calendar" },
  { label: "Review check-ins", hint: "Late, simulated, weak GPS, offline", href: "/review", icon: "check" },
  { label: "Shifts and swaps", hint: "Approve swaps, see the roster", href: "/shifts", icon: "clock" },
  { label: "Today's visits", hint: "Who checked in where", href: "/field", icon: "map" },
  { label: "Payroll", hint: "Cycle status, rupees from templates, OTP release", href: "/payroll", icon: "wallet" },
  { label: "Tasks", hint: "Inbox, steps, delay alert, timeline", href: "/tasks", icon: "briefcase" },
  { label: "Leads", hint: "Sheet leads, assign, follow-up", href: "/leads", icon: "phone" },
  { label: "Check in", hint: "Clock in from this phone", href: "/check-in", icon: "check" },
  { label: "Leave", hint: "Approve days away", href: "/leave", icon: "calendar" },
];

const employeeLinks: Link[] = [
  { label: "My tasks", hint: "Action needed, steps, delay, timeline", href: "/tasks", icon: "briefcase" },
  { label: "My leads", hint: "Assigned to you · follow-up, converted, cold", href: "/leads", icon: "phone" },
  { label: "My shifts", hint: "Roster, swaps, and cover", href: "/shifts", icon: "clock" },
];

const pushLabels: Record<PushState, string> = {
  on: "On. Alerts and approvals arrive on this phone.",
  denied: "Off. Turn them on to hear about alerts and approvals.",
  unsupported: "Expo Go cannot receive notifications. Install the InField APK.",
  failed: "This phone could not register. Check the internet and try again.",
};

function timeAgo(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

export default function More() {
  const [session, setSession] = useState<Session | null>(null);
  const [push, setPush] = useState<PushState | null>(null);
  const [info, setInfo] = useState<PushInfo | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshPush = useCallback(async (current: Session, ask: boolean) => {
    const state = await registerPush(current, ask);
    setPush(state);
    const body = await api<PushInfo>("/push-tokens", {}, current.token).catch(() => null);
    setInfo(body);
    return state;
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSession().then((current) => {
        if (!current) {
          router.replace("/login");
          return;
        }
        setSession(current);
        refreshPush(current, false).catch(() => undefined);
      });
    }, [refreshPush]),
  );

  const employee = session?.user.role === "employee";
  const links = employee ? employeeLinks : managerLinks;

  async function turnOn() {
    if (!session) return;
    setBusy(true);
    setNote(null);
    const state = await refreshPush(session, true);
    if (state === "denied") {
      setNote("Android blocked notifications for InField. Opening settings so you can allow them.");
      Linking.openSettings().catch(() => undefined);
    }
    setBusy(false);
  }

  async function sendTest() {
    if (!session) return;
    setBusy(true);
    setNote(null);
    try {
      const result = await api<{ devices: number; provider?: string; status?: string }>(
        "/push-tokens/test",
        { method: "POST", body: "{}" },
        session.token,
      );
      if (result.devices === 0 || result.status === "no_device") {
        setNote("No phone is registered yet. Turn on notifications on this device first.");
      } else if (result.provider === "log" || result.status === "logged") {
        setNote("The API is in log mode (PUSH_PROVIDER=log). It did not send to this phone. Set PUSH_PROVIDER=expo on the server and restart the API.");
      } else if (result.status === "failed") {
        setNote("The send failed. On Expo, upload FCM V1 credentials for com.infield7.app, then try again.");
      } else {
        setNote("Test sent. It should arrive within a few seconds. If the app is open, check the shade; if it is in Expo Go, install the APK.");
      }
      await refreshPush(session, false);
    } catch (error) {
      setNote(error instanceof ApiError ? error.message : "The test could not be sent.");
    }
    setBusy(false);
  }

  return (
    <ScreenShell>
      <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ paddingBottom: 24 }}>
        <TopBar
          title={session?.user.name || "Me"}
          subtitle={`${session?.workspace.name || "InField 7"}${session ? ` · ${employee ? "field" : session.user.role}` : ""}`}
          left={<Avatar name={session?.user.name || session?.user.phone || "Me"} size={38} />}
          right={<IconBtn icon="settings" />}
        />
        <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
        <View style={styles.card}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: colors.ink }}>Notifications</Text>
          <Text style={[styles.sub, { marginBottom: 0, marginTop: 4 }]}>{push ? pushLabels[push] : "Checking this phone…"}</Text>
          {note ? <Text style={{ color: colors.ink, fontSize: 13, marginTop: 8 }}>{note}</Text> : null}
          {push === "denied" || push === "failed" ? (
            <Pressable disabled={busy} onPress={turnOn} style={[styles.button, { marginTop: 12 }]}>
              <Text style={styles.buttonText}>Turn on notifications</Text>
            </Pressable>
          ) : null}
          {push === "on" ? (
            <Pressable disabled={busy} onPress={sendTest} style={[styles.button, styles.secondary, { marginTop: 12 }]}>
              <Text style={[styles.buttonText, styles.secondaryText]}>Send a test notification</Text>
            </Pressable>
          ) : null}
          {info && info.recent.length > 0 ? (
            <View style={{ marginTop: 12, gap: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.ink3 }}>RECENT</Text>
              {info.recent.slice(0, 3).map((item, index) => (
                <View key={`${item.sentAt}-${index}`}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.ink }}>{item.title}</Text>
                  <Text style={{ fontSize: 13, color: colors.ink }}>{item.body}</Text>
                  <Text style={{ fontSize: 12, color: colors.ink3 }}>
                    {timeAgo(item.sentAt)}
                    {item.status === "failed"
                      ? " · did not reach the phone"
                      : item.status === "no_device"
                        ? " · no phone was registered"
                        : item.status === "logged"
                          ? " · API log only, not sent to a phone"
                          : ""}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        {links.map((link) => (
          <MenuRow key={String(link.href)} label={link.label} hint={link.hint} icon={link.icon} onPress={() => router.push(link.href)} />
        ))}
        <Pressable
          onPress={async () => {
            stopPresence();
            await stopBackground();
            await unregisterPush();
            await leaveSession();
            router.replace("/login");
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            marginTop: 8,
            paddingVertical: 14,
            borderRadius: 12,
            backgroundColor: colors.paper,
            borderWidth: 1,
            borderColor: colors.cream2,
          }}
        >
          <Icon name="logout" size={16} color={colors.coral} />
          <Text style={{ color: colors.coral, fontWeight: "600", fontSize: 16 }}>Sign out</Text>
        </Pressable>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}
