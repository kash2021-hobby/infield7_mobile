import { AppState, type NativeEventSubscription } from "react-native";
import * as Location from "expo-location";
import { api } from "@/api";
import { backgroundRunning } from "@/background";
import { loadSession } from "@/session";

const EVERY_MS = 60_000;

export type FenceState = "inside" | "leaving" | "left" | "unassigned";

let timer: ReturnType<typeof setInterval> | null = null;
let appState: NativeEventSubscription | null = null;
let idleUntilCheckIn = false;

async function sendOnce() {
  if (AppState.currentState !== "active") return;
  if (await backgroundRunning()) return;
  const session = await loadSession();
  if (!session || session.user.role !== "employee") return stopPresence();
  const permission = await Location.getForegroundPermissionsAsync();
  if (!permission.granted) return stopPresence();
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const accuracy = position.coords.accuracy ?? 0;
  if (accuracy <= 0 || accuracy > 80) return;
  const result = await api<{ state: FenceState }>(
    "/presence",
    {
      method: "POST",
      body: JSON.stringify({ lat: position.coords.latitude, lng: position.coords.longitude, accuracyM: accuracy }),
    },
    session.token,
  );
  if (result.state === "unassigned" || result.state === "left") {
    idleUntilCheckIn = true;
    stopPresence();
  }
}

function tick() {
  sendOnce().catch(() => undefined);
}

export function resumePresence() {
  if (!idleUntilCheckIn) startPresence();
}

export function startPresence() {
  idleUntilCheckIn = false;
  if (timer) return;
  timer = setInterval(tick, EVERY_MS);
  appState = AppState.addEventListener("change", (next) => {
    if (next === "active") tick();
  });
  tick();
}

export function stopPresence() {
  if (timer) clearInterval(timer);
  timer = null;
  appState?.remove();
  appState = null;
}
