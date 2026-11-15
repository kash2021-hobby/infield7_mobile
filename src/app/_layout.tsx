import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { Stack, usePathname, type ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "@/background";
import { installCrashReporting, reportError, setCrashScreen } from "@/crash";
import { useNotificationTaps } from "@/push";
import { loadSession } from "@/session";
import { flushTaskUpdates } from "@/task-outbox";
import { colors, styles } from "@/theme";

installCrashReporting();

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportError(error, false).catch(() => undefined);
  }, [error]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.cream, justifyContent: "center", padding: 24 }}>
      <Text style={styles.title}>This screen stopped working</Text>
      <Text style={{ color: colors.ink3, fontSize: 15, lineHeight: 22 }}>
        A report is saved for your admin and sends when you are online. Check-ins waiting to send stay on this phone.
      </Text>
      <Pressable style={[styles.button, { marginTop: 24 }]} onPress={retry}>
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  const pathname = usePathname();
  useEffect(() => {
    setCrashScreen(pathname);
  }, [pathname]);
  useNotificationTaps();
  useEffect(() => {
    loadSession()
      .then((session) => {
        if (session) return flushTaskUpdates(session);
      })
      .catch(() => undefined);
  }, [pathname]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.cream },
          headerShadowVisible: false,
          headerTintColor: colors.ink,
          contentStyle: { backgroundColor: colors.cream },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="join" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="verify" options={{ title: "Code" }} />
        <Stack.Screen name="overview" options={{ headerShown: false }} />
        <Stack.Screen name="map" options={{ headerShown: false }} />
        <Stack.Screen name="team" options={{ headerShown: false }} />
        <Stack.Screen name="person/[userId]" options={{ headerShown: false }} />
        <Stack.Screen name="geofence" options={{ headerShown: false }} />
        <Stack.Screen name="check-in" options={{ headerShown: false }} />
        <Stack.Screen name="visits" options={{ headerShown: false }} />
        <Stack.Screen name="tasks" options={{ headerShown: false }} />
        <Stack.Screen name="leads" options={{ headerShown: false }} />
        <Stack.Screen name="lead/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="task/new" options={{ headerShown: false }} />
        <Stack.Screen name="task/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="leave" options={{ headerShown: false }} />
        <Stack.Screen name="alerts" options={{ headerShown: false }} />
        <Stack.Screen name="attendance" options={{ headerShown: false }} />
        <Stack.Screen name="review" options={{ headerShown: false }} />
        <Stack.Screen name="on-duty" options={{ headerShown: false }} />
        <Stack.Screen name="shifts" options={{ headerShown: false }} />
        <Stack.Screen name="field" options={{ headerShown: false }} />
        <Stack.Screen name="payroll" options={{ headerShown: false }} />
        <Stack.Screen name="copilot" options={{ headerShown: false }} />
        <Stack.Screen name="more" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
