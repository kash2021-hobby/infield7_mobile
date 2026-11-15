import { Alert } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { api } from "./api";
import { loadSession } from "./session";

export const BACKGROUND_TASK = "infield7-duty-location";

type FenceState = "inside" | "leaving" | "left" | "unassigned";
type Pace = "calm" | "watch";

let currentPace: Pace | null = null;

const paces: Record<Pace, Pick<Location.LocationTaskOptions, "timeInterval" | "distanceInterval" | "deferredUpdatesInterval">> = {
  calm: { timeInterval: 5 * 60_000, distanceInterval: 100, deferredUpdatesInterval: 5 * 60_000 },
  watch: { timeInterval: 60_000, distanceInterval: 20, deferredUpdatesInterval: 60_000 },
};

export function backgroundSupported() {
  return Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}

async function start(pace: Pace) {
  await Location.startLocationUpdatesAsync(BACKGROUND_TASK, {
    accuracy: Location.Accuracy.Balanced,
    ...paces[pace],
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "InField is sharing your location",
      notificationBody: "Only while you are on duty. Check out to stop.",
      notificationColor: "#0E7A3D",
    },
  });
  currentPace = pace;
}

export async function backgroundRunning() {
  if (!backgroundSupported()) return false;
  try {
    return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK);
  } catch {
    return false;
  }
}

export async function stopBackground() {
  currentPace = null;
  if (await backgroundRunning()) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_TASK).catch(() => undefined);
  }
}

function askDisclosure() {
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      "Allow location all the time",
      "Choose \"Allow all the time\" on the next screen. InField only uses it while you are checked in. It stops when you check out. The permission stays on so the next clock-in works without asking again.",
      [{ text: "Continue", onPress: () => resolve(true) }],
      { cancelable: false },
    );
  });
}

export async function alwaysLocationGranted() {
  const foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) return false;
  if (!backgroundSupported()) return true;
  const background = await Location.getBackgroundPermissionsAsync();
  return background.granted;
}

export async function ensureAlwaysLocation() {
  const enabled = await Location.hasServicesEnabledAsync();
  if (!enabled) return "off" as const;
  let foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) {
    foreground = await Location.requestForegroundPermissionsAsync();
  }
  if (!foreground.granted) return "denied" as const;
  if (!backgroundSupported()) return "granted" as const;
  let background = await Location.getBackgroundPermissionsAsync();
  if (background.granted) return "granted" as const;
  await askDisclosure();
  background = await Location.requestBackgroundPermissionsAsync();
  return background.granted ? ("granted" as const) : ("denied" as const);
}

export async function startBackgroundAfterCheckIn() {
  if (!backgroundSupported()) return "unsupported" as const;
  try {
    if (!(await alwaysLocationGranted())) return "denied" as const;
    if (await backgroundRunning()) return "running" as const;
    await start("calm");
    return "running" as const;
  } catch {
    return "unsupported" as const;
  }
}

export async function resumeBackgroundIfAllowed() {
  if (!backgroundSupported()) return;
  try {
    if (await backgroundRunning()) return;
    if (await alwaysLocationGranted()) await start("calm");
  } catch {
    return;
  }
}

async function adjust(state: FenceState) {
  if (state === "unassigned" || state === "left") {
    await stopBackground();
    return;
  }
  const wanted: Pace = state === "leaving" ? "watch" : "calm";
  if (wanted !== currentPace) await start(wanted);
}

if (backgroundSupported()) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(BACKGROUND_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    const latest = data.locations[data.locations.length - 1];
    const accuracy = latest.coords.accuracy ?? 0;
    if (accuracy <= 0 || accuracy > 80) return;
    try {
      const session = await loadSession();
      if (!session) {
        await stopBackground();
        return;
      }
      const result = await api<{ state: FenceState }>(
        "/presence",
        { method: "POST", body: JSON.stringify({ lat: latest.coords.latitude, lng: latest.coords.longitude, accuracyM: accuracy }) },
        session.token,
      );
      await adjust(result.state);
    } catch {
      return;
    }
  });
}
