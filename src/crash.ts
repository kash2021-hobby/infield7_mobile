import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { api } from "./api";
import { loadSession } from "./session";

const OUTBOX = "if7-crash-outbox";
const MAX_SAVED = 20;

type Report = {
  message: string;
  stack?: string;
  screen?: string;
  fatal: boolean;
  platform: string;
  appVersion?: string;
  occurredAt: string;
};

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsShape = { getGlobalHandler(): GlobalHandler; setGlobalHandler(handler: GlobalHandler): void };

let currentScreen: string | undefined;
let installed = false;
let flushing = false;

export function setCrashScreen(screen: string) {
  currentScreen = screen;
}

async function readOutbox(): Promise<Report[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(OUTBOX)) ?? "[]") as Report[];
  } catch {
    return [];
  }
}

export async function flushCrashReports() {
  if (flushing) return;
  flushing = true;
  try {
    const saved = await readOutbox();
    if (saved.length === 0) return;
    const session = await loadSession();
    await api("/client-errors", { method: "POST", body: JSON.stringify({ reports: saved }) }, session?.token);
    const after = await readOutbox();
    await AsyncStorage.setItem(OUTBOX, JSON.stringify(after.slice(saved.length)));
  } catch {
    return;
  } finally {
    flushing = false;
  }
}

export async function reportError(error: unknown, fatal: boolean) {
  const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error");
  const report: Report = {
    message: err.message || err.name || "Unknown error",
    stack: err.stack,
    screen: currentScreen,
    fatal,
    platform: Platform.OS,
    appVersion: Constants.expoConfig?.version,
    occurredAt: new Date().toISOString(),
  };
  try {
    const saved = await readOutbox();
    saved.push(report);
    await AsyncStorage.setItem(OUTBOX, JSON.stringify(saved.slice(-MAX_SAVED)));
  } catch {
    return;
  }
  await flushCrashReports();
}

export function installCrashReporting() {
  if (installed) return;
  installed = true;
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsShape }).ErrorUtils;
  if (errorUtils) {
    const previous = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error, isFatal) => {
      reportError(error, isFatal === true).catch(() => undefined);
      previous(error, isFatal);
    });
  }
  flushCrashReports().catch(() => undefined);
}
