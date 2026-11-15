import Constants from "expo-constants";

export class ApiError extends Error {
  constructor(
    message: string,
    public offline = false,
  ) {
    super(message);
  }
}

function lanHost() {
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  if (!hostUri) return null;
  const host = hostUri.split(":")[0];
  if (!host || host === "localhost" || host === "127.0.0.1") return null;
  return host;
}

function isLoopback(url?: string) {
  if (!url) return true;
  try {
    const hostname = new URL(url).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return true;
  }
}

const configured = process.env.EXPO_PUBLIC_API_URL;
const host = lanHost();
/** On a phone, localhost is the phone. Use the Metro machine's LAN IP for local APIs. */
export const API_URL =
  configured && !isLoopback(configured)
    ? configured
    : host
      ? `http://${host}:4000`
      : (configured ?? "http://127.0.0.1:4000");

const TIMEOUT_MS = 8_000;

export async function api<T>(path: string, init: RequestInit = {}, token?: string, timeoutMs = TIMEOUT_MS): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers, signal: controller.signal });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new ApiError(
      aborted ? "The server did not answer. Stay on this Wi-Fi and keep the API running." : error instanceof Error ? error.message : "Network request failed",
      true,
    );
  } finally {
    clearTimeout(timer);
  }
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new ApiError(body.error || "Request failed");
  return body;
}
