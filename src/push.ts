import { useEffect } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { router, type Href } from "expo-router";
import { api } from "./api";
import { reportError } from "./crash";
import { loadSession, type Session } from "./session";

const TOKEN_KEY = "if7-push-token";
const CHANNEL = "alerts";

export type PushState = "on" | "denied" | "unsupported" | "failed";

type NotificationsModule = typeof import("expo-notifications");
type NotificationResponse = import("expo-notifications").NotificationResponse;

let cached: NotificationsModule | null | undefined;

export function pushSupported() {
  return Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}

function notifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  if (!pushSupported()) {
    cached = null;
    return null;
  }
  try {
    // Expo Go on Android throws if this package is loaded. Only require it in a real build.
    const mod = require("expo-notifications") as NotificationsModule;
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    cached = mod;
    return mod;
  } catch (error) {
    reportError(error, false).catch(() => undefined);
    cached = null;
    return null;
  }
}

async function ensureChannel(mod: NotificationsModule) {
  if (Platform.OS !== "android") return;
  await mod.setNotificationChannelAsync(CHANNEL, {
    name: "Alerts and approvals",
    importance: mod.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#0E7A3D",
  });
}

let registeredFor: string | null = null;

export async function registerPush(session: Session, ask: boolean): Promise<PushState> {
  const mod = notifications();
  if (!mod) return "unsupported";
  try {
    await ensureChannel(mod);
    let { status } = await mod.getPermissionsAsync();
    if (status !== "granted" && ask) status = (await mod.requestPermissionsAsync()).status;
    if (status !== "granted") return "denied";
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data } = await mod.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await api("/push-tokens", { method: "POST", body: JSON.stringify({ token: data, platform: Platform.OS }) }, session.token);
    await AsyncStorage.setItem(TOKEN_KEY, data);
    registeredFor = session.user.id;
    return "on";
  } catch (error) {
    reportError(error, false).catch(() => undefined);
    return "failed";
  }
}

export function registerPushOnce(session: Session) {
  if (registeredFor === session.user.id) return;
  registeredFor = session.user.id;
  registerPush(session, true)
    .then((state) => {
      if (state !== "on") registeredFor = null;
    })
    .catch(() => {
      registeredFor = null;
    });
}

export async function unregisterPush() {
  registeredFor = null;
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) return;
  await AsyncStorage.removeItem(TOKEN_KEY);
  const session = await loadSession();
  if (!session) return;
  await api("/push-tokens/remove", { method: "POST", body: JSON.stringify({ token }) }, session.token).catch(() => undefined);
}

const opened = new Set<string>();

function openFrom(response: NotificationResponse | null) {
  if (!response) return;
  const id = response.notification.request.identifier;
  if (opened.has(id)) return;
  opened.add(id);
  const url = response.notification.request.content.data?.url;
  if (typeof url !== "string" || !url.startsWith("/")) return;
  loadSession()
    .then((session) => {
      if (session) router.push(url as Href);
    })
    .catch(() => undefined);
}

export function useNotificationTaps() {
  useEffect(() => {
    const mod = notifications();
    if (!mod) return undefined;
    try {
      mod.getLastNotificationResponseAsync().then(openFrom).catch(() => undefined);
      const subscription = mod.addNotificationResponseReceivedListener(openFrom);
      return () => subscription.remove();
    } catch {
      return undefined;
    }
  }, []);
}
