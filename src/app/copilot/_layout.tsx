import { Stack } from "expo-router";
import { colors } from "@/theme";

export default function CopilotLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.cream },
        headerShadowVisible: false,
        headerTintColor: colors.ink,
        contentStyle: { backgroundColor: colors.cream },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="briefing" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ headerShown: false }} />
      <Stack.Screen name="optimize" options={{ headerShown: false }} />
      <Stack.Screen name="patterns" options={{ headerShown: false }} />
    </Stack>
  );
}
