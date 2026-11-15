import { Stack } from "expo-router";
import { colors } from "@/theme";

export default function TaskLayout() {
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
      <Stack.Screen name="update" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="next" options={{ headerShown: false }} />
      <Stack.Screen name="delay" options={{ headerShown: false }} />
      <Stack.Screen name="workflow" options={{ headerShown: false }} />
    </Stack>
  );
}
