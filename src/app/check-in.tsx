import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useFocusEffect } from "expo-router";
import * as Crypto from "expo-crypto";
import * as Location from "expo-location";
import { api, ApiError } from "@/api";
import { ScreenShell, TopBar, IconBtn } from "@/chrome";
import { Icon } from "@/icons";
import { alwaysLocationGranted, ensureAlwaysLocation, resumeBackgroundIfAllowed, startBackgroundAfterCheckIn, stopBackground } from "@/background";
import { captureFieldPhoto } from "@/photo";
import { startPresence, stopPresence } from "@/presence";
import { loadSession, type Session } from "@/session";
import { colors, styles } from "@/theme";

const OUTBOX = "if7-checkin-outbox";

type Fix = { lat: number; lng: number; accuracyM: number };

type QueuedCheckIn = {
  kind?: "checkin";
  clientId: string;
  lat: number;
  lng: number;
  accuracyM: number;
  selfieBase64?: string;
  mocked?: boolean;
  capturedAt?: string;
};

type QueuedCheckOut = Partial<Fix> & {
  kind: "checkout";
  clientId: string;
  checkinId?: string;
  checkinClientId?: string;
  capturedAt: string;
};

type Queued = QueuedCheckIn | QueuedCheckOut;

type MyDay = {
  open: { id: string; site: string | null; checkedInAt: string } | null;
  closedToday?: boolean;
  canCheckIn?: boolean;
  today: { id: string; site: string | null; checkedInAt: string; checkedOutAt: string | null; hours: number | null }[];
  hoursToday?: number;
  hoursWeek?: number;
  streak?: number;
  site?: { id: string; name: string; address: string | null; lat: number; lng: number; radiusM: number } | null;
};

type VisitStop = { siteId: string; site: string; lat: number; lng: number; km: number; tasks: { id: string; title: string }[] };
type VisitRoute = { remaining: VisitStop[]; done: { site: string | null }[] };
type TaskRow = { id: string; title: string; dueOn: string | null; status: string; site: string | null };

type Duty = { checkinId?: string; checkinClientId?: string; site: string | null; since: string; waiting: boolean };

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function firstName(session: Session | null) {
  const name = session?.user.name?.trim();
  if (!name) return "there";
  return name.split(/\s+/)[0];
}

function todayLine() {
  return new Date().toLocaleString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function compactHours(hours: number) {
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radius = 6_371_000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(a));
}

async function readOutbox(): Promise<Queued[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(OUTBOX)) ?? "[]") as Queued[];
  } catch {
    return [];
  }
}

async function writeOutbox(items: Queued[]) {
  await AsyncStorage.setItem(OUTBOX, JSON.stringify(items));
}

function dutyFrom(day: MyDay | null, outbox: Queued[]): Duty | null {
  const last = outbox[outbox.length - 1];
  if (last?.kind === "checkout") return null;
  if (last) return { checkinClientId: last.clientId, site: null, since: last.capturedAt ?? new Date().toISOString(), waiting: true };
  if (!day?.open) return null;
  return { checkinId: day.open.id, site: day.open.site, since: day.open.checkedInAt, waiting: false };
}

function finishedToday(day: MyDay | null, outbox: Queued[]) {
  if (dutyFrom(day, outbox)) return false;
  if (day?.closedToday || day?.canCheckIn === false) return true;
  if ((day?.today ?? []).some((row) => row.checkedOutAt)) return true;
  return outbox[outbox.length - 1]?.kind === "checkout";
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("gps-timeout")), ms);
    }),
  ]);
}

function usableFix(position: Location.LocationObject | null, maxAccuracy = 250) {
  const accuracy = position?.coords.accuracy ?? 0;
  if (!position || accuracy <= 0 || accuracy > maxAccuracy) return null;
  return position;
}

async function readFix(accuracy: Location.LocationAccuracy, ms: number) {
  return usableFix(
    await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy,
        mayShowUserSettingsDialog: true,
      }),
      ms,
    ),
  );
}

async function readPosition() {
  const enabled = await Location.hasServicesEnabledAsync();
  if (!enabled) {
    throw new Error("Location is off on this phone. Turn it on, then try again.");
  }
  const known = usableFix(await Location.getLastKnownPositionAsync({ maxAge: 180_000, requiredAccuracy: 250 }), 250);
  const balanced = await readFix(Location.Accuracy.Balanced, 25_000).catch(() => null);
  if (balanced) return balanced;
  if (known) return known;
  const coarse = await readFix(Location.Accuracy.Low, 15_000).catch(() => null);
  if (coarse) return coarse;
  throw new Error("Could not get a GPS fix. Keep Location on, wait a few seconds, and try again. Step outside if you are indoors.");
}

async function send(item: Queued, token: string) {
  if (item.kind === "checkout") {
    const { kind: _kind, clientId: _clientId, ...body } = item;
    return api<{ hours: number; early: boolean; site: string | null; replayed?: boolean }>(
      "/check-outs",
      { method: "POST", body: JSON.stringify(body) },
      token,
    );
  }
  const { kind: _kind, ...body } = item;
    return api("/check-ins", { method: "POST", body: JSON.stringify(body) }, token, 20_000);
}

export default function CheckIn() {
  const [session, setSession] = useState<Session | null>(null);
  const [granted, setGranted] = useState<boolean | null>(null);
  const [alwaysOn, setAlwaysOn] = useState<boolean | null>(null);
  const [selfie, setSelfie] = useState<string | undefined>();
  const [visits, setVisits] = useState<VisitRoute | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [outbox, setOutbox] = useState<Queued[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [day, setDay] = useState<MyDay | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [tick, setTick] = useState(0);

  const duty = dutyFrom(day, outbox);
  const dutyKey = duty?.checkinId ?? duty?.checkinClientId ?? null;
  const doneToday = finishedToday(day, outbox);
  const waitingIns = outbox.filter((item) => item.kind !== "checkout").length;
  const waitingOuts = outbox.length - waitingIns;

  const loadDay = useCallback(async (current: Session) => {
    try {
      const next = await api<MyDay>("/my-day", {}, current.token);
      setDay(next);
      const pending = await readOutbox();
      if (dutyFrom(next, pending)?.waiting === false) resumeBackgroundIfAllowed().catch(() => undefined);
      else {
        stopPresence();
        stopBackground().catch(() => undefined);
      }
      try {
        let query = "";
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.granted) {
          const position = await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 200 });
          if (position) query = `?lat=${position.coords.latitude}&lng=${position.coords.longitude}`;
        }
        setVisits(await api<VisitRoute>(`/visits${query}`, {}, current.token));
      } catch {
        setVisits(null);
      }
      try {
        const listed = await api<{ tasks: TaskRow[] }>("/tasks", {}, current.token);
        setTasks(listed.tasks);
      } catch {
        setTasks([]);
      }
    } catch {
      setDay(null);
    }
  }, []);

  const flush = useCallback(async (current: Session) => {
    const items = await readOutbox();
    const left: Queued[] = [];
    const refused: string[] = [];
    let sent = 0;
    for (const item of items) {
      if (left.length > 0) {
        left.push(item);
        continue;
      }
      try {
        await send(item, current.token);
        sent += 1;
      } catch (err) {
        if (err instanceof ApiError && err.offline) left.push(item);
        else refused.push(err instanceof Error ? err.message : "A saved entry was refused.");
      }
    }
    await writeOutbox(left);
    setOutbox(left);
    if (refused.length > 0) setError(refused.join(" "));
    return sent;
  }, []);

  const refresh = useCallback(async () => {
    const current = await loadSession();
    if (!current) {
      router.replace("/login");
      return;
    }
    setSession(current);
    const pending = await readOutbox();
    setOutbox(pending);
    if (pending.length > 0) await flush(current);
    const [body, always] = await Promise.all([
      api<{ granted: boolean }>("/consent", {}, current.token),
      alwaysLocationGranted(),
      loadDay(current),
    ]);
    setGranted(body.granted);
    setAlwaysOn(always);
  }, [flush, loadDay]);

  async function checkOut() {
    if (!session || !duty) return;
    setBusy(true);
    setError("");
    setMessage("");
    let fix: Fix | undefined;
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.granted) {
        const position = await readPosition();
        const accuracy = position.coords.accuracy ?? 0;
        if (accuracy > 0) fix = { lat: position.coords.latitude, lng: position.coords.longitude, accuracyM: accuracy };
      }
    } catch {
      fix = undefined;
    }
    const item: QueuedCheckOut = {
      kind: "checkout",
      clientId: Crypto.randomUUID(),
      ...(duty.checkinId ? { checkinId: duty.checkinId } : { checkinClientId: duty.checkinClientId }),
      ...fix,
      capturedAt: new Date().toISOString(),
    };
    try {
      const pending = await readOutbox();
      if (pending.length > 0) {
        await writeOutbox([...pending, item]);
        setOutbox([...pending, item]);
        stopPresence();
        await stopBackground();
        await flush(session);
        const still = (await readOutbox()).length > 0;
        setMessage(still ? `Checked out on this phone at ${clock(item.capturedAt)}. It will send when the connection returns.` : `Checked out at ${clock(item.capturedAt)}.`);
        await loadDay(session);
        return;
      }
      const result = (await send(item, session.token)) as { hours: number; early: boolean; site: string | null };
      stopPresence();
      await stopBackground();
      const early = result.early ? " This is before your shift ends, so your manager will look it over." : "";
      setMessage(`Checked out${result.site ? ` of ${result.site}` : ""}. ${compactHours(result.hours)} on duty.${early}`);
      await loadDay(session);
    } catch (err) {
      if (err instanceof ApiError && err.offline) {
        const next = [...(await readOutbox()), item];
        await writeOutbox(next);
        setOutbox(next);
        stopPresence();
        await stopBackground();
        setMessage(`Checked out on this phone at ${clock(item.capturedAt)}. It will send when the connection returns.`);
      } else {
        setError(err instanceof Error ? err.message : "Check-out failed");
        await loadDay(session);
      }
    } finally {
      setBusy(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [refresh]),
  );

  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (granted !== true || !dutyKey) {
      setFix(null);
      return;
    }
    let cancelled = false;
    let sub: Location.LocationSubscription | undefined;
    Location.getForegroundPermissionsAsync()
      .then(async (permission) => {
        if (!permission.granted || cancelled) return;
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 8, timeInterval: 15_000 },
          (position) => {
            const accuracy = position.coords.accuracy ?? 0;
            if (accuracy <= 0) return;
            setFix({ lat: position.coords.latitude, lng: position.coords.longitude, accuracyM: accuracy });
          },
        );
        if (cancelled) sub.remove();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [granted, dutyKey]);

  async function allow() {
    if (!session) return;
    setError("");
    await api("/consent", { method: "POST", body: "{}" }, session.token);
    setGranted(true);
    const result = await ensureAlwaysLocation();
    if (result === "off") {
      setAlwaysOn(false);
      setError("Turn Location on in this phone’s settings, then try again.");
      return;
    }
    if (result !== "granted") {
      setAlwaysOn(false);
      setError("Choose Allow all the time. InField only uses it while you are on duty, and stops after check-out.");
      return;
    }
    setAlwaysOn(true);
  }

  async function askAlwaysOn() {
    setError("");
    const result = await ensureAlwaysLocation();
    if (result === "off") {
      setAlwaysOn(false);
      setError("Turn Location on in this phone’s settings, then try again.");
      return false;
    }
    if (result !== "granted") {
      setAlwaysOn(false);
      setError("Choose Allow all the time in Location settings.");
      return false;
    }
    setAlwaysOn(true);
    return true;
  }

  async function checkIn() {
    if (!session) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (finishedToday(day, await readOutbox())) {
        setError("You already clocked out today. You can clock in again tomorrow.");
        return;
      }
      if (!(await askAlwaysOn())) return;
      const locating = readPosition();
      const shot = await captureFieldPhoto("Camera permission is required for the check-in photo.").catch(() => null);
      if (shot) setSelfie(shot);
      const position = (await locating.catch(() => null)) ?? (await readPosition());
      const accuracy = position.coords.accuracy ?? 0;
      if (accuracy <= 0) {
        setError("The location fix was not sharp enough.");
        return;
      }
      const payload: QueuedCheckIn = {
        kind: "checkin",
        clientId: Crypto.randomUUID(),
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracyM: accuracy,
        ...(shot ? { selfieBase64: shot } : {}),
        mocked: position.mocked === true,
        capturedAt: new Date().toISOString(),
      };
      const pending = await readOutbox();
      if (pending.length > 0) {
        await writeOutbox([...pending, payload]);
        setOutbox([...pending, payload]);
        const sent = await flush(session);
        const still = (await readOutbox()).length > 0;
        setMessage(still ? "Saved on this phone. It will send when the connection returns." : `Checked in. Sent ${sent} saved entr${sent === 1 ? "y" : "ies"}.`);
        if (!still) startPresence();
        setSelfie(undefined);
        await loadDay(session);
        return;
      }
      try {
        const result = await api<{ site?: string; late?: boolean; replayed?: boolean; flags?: string[]; review?: string }>(
          "/check-ins",
          { method: "POST", body: JSON.stringify({ ...payload, kind: undefined }) },
          session.token,
        );
        startPresence();
        const tracking = result.replayed ? null : await startBackgroundAfterCheckIn();
        const late = result.late ? " Marked late." : "";
        const review = result.flags?.includes("mocked")
          ? " Your manager will confirm it before it counts."
          : result.review === "pending"
            ? " Your manager will look it over."
            : "";
        const sharing =
          tracking === "running"
            ? " Location sharing is on until you check out."
            : tracking === "denied"
              ? " Location sharing did not start. Choose Allow all the time in settings."
              : "";
        setMessage(result.replayed ? "Already recorded." : `Checked in at ${result.site ?? "the site"}.${late}${review}${sharing}`);
        await loadDay(session);
        setSelfie(undefined);
      } catch (err) {
        if (err instanceof ApiError && err.offline) {
          const next = [...(await readOutbox()), payload];
          await writeOutbox(next);
          setOutbox(next);
          setSelfie(undefined);
          setMessage("Saved on this phone. It will send when the connection returns.");
        } else {
          throw err;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function sos() {
    if (!session) return;
    setError("");
    try {
      await api("/sos", { method: "POST", body: "{}" }, session.token);
      setMessage("SOS sent to your manager.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send SOS");
    }
  }

  const site = day?.site ?? null;
  const metres = site && fix ? Math.round(distanceM(fix.lat, fix.lng, site.lat, site.lng)) : null;
  const inside = metres !== null && site ? metres <= site.radiusM : null;
  const siteName = duty?.site || site?.name || session?.workspace.name || "Your site";
  const liveHours = (() => {
    if (!day) return 0;
    if (!day.open) return day.hoursToday ?? 0;
    const closed = (day.today ?? []).filter((row) => row.id !== day.open?.id).reduce((sum, row) => sum + (row.hours ?? 0), 0);
    return closed + (Date.now() - new Date(day.open.checkedInAt).getTime()) / 3_600_000;
  })();
  void tick;
  const hoursWeek = day?.hoursWeek ?? 0;
  const streak = day?.streak ?? 0;
  const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const openTasks = tasks.filter((task) => task.status === "new" || task.status === "in_progress");
  const schedule = [
    ...openTasks.map((task) => {
      const due = task.dueOn?.slice(0, 10);
      const when = task.status === "in_progress" ? "Now" : due && due < todayKey ? "Overdue" : due === todayKey ? "Today" : due ? "Upcoming" : "New";
      return { id: task.id, when, title: task.title, href: `/task/${task.id}` as const };
    }),
    ...(visits?.remaining ?? []).map((stop) => ({
      id: `visit-${stop.siteId}`,
      when: Number.isFinite(stop.km) ? `${stop.km.toFixed(1)} km` : "Visit",
      title: stop.site,
      href: "/visits" as const,
    })),
  ].slice(0, 8);

  if (granted === false) {
    return (
      <ScreenShell>
      <View style={styles.screen}>
        <TopBar title="Location for check-in" />
        <Text style={styles.sub}>
          InField needs location set to Allow all the time. It only uses it while you are checked in, and stops when you check out. The permission stays on so the next clock-in does not ask again. Without it, check-in stays unavailable.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.button} onPress={() => void allow()}>
          <Text style={styles.buttonText}>I agree — Allow all the time</Text>
        </Pressable>
      </View>
      </ScreenShell>
    );
  }

  if (granted === true && alwaysOn === false) {
    return (
      <ScreenShell>
      <View style={styles.screen}>
        <TopBar title="Allow all the time" />
        <Text style={styles.sub}>
          Open Location settings and choose Allow all the time. InField does not follow you after check-out. Tracking starts only when you clock in, and stops when you clock out.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.button} onPress={() => void askAlwaysOn()}>
          <Text style={styles.buttonText}>Allow all the time</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.secondary]} onPress={() => void Linking.openSettings()}>
          <Text style={[styles.buttonText, styles.secondaryText]}>Open settings</Text>
        </Pressable>
      </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
    <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ paddingBottom: 28 }}>
      <TopBar
        title={`${greeting()}, ${firstName(session)}`}
        subtitle={todayLine()}
        right={<IconBtn icon="bell" tone="coral" onPress={() => void sos()} />}
      />

      <View style={{ paddingHorizontal: 20 }}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.notice}>{message}</Text> : null}
        {outbox.length > 0 ? (
          <Text style={styles.sub}>
            Waiting to send:{waitingIns ? ` ${waitingIns} check-in${waitingIns === 1 ? "" : "s"}` : ""}
            {waitingIns && waitingOuts ? "," : ""}
            {waitingOuts ? ` ${waitingOuts} check-out${waitingOuts === 1 ? "" : "s"}` : ""}. Sends when you are back online.
          </Text>
        ) : null}

        <View style={[styles.card, { padding: 0, overflow: "hidden" }]}>
          <View style={{ height: 160, backgroundColor: colors.greenSoft, alignItems: "center", justifyContent: "center" }}>
            {[140, 88, 18].map((size, index) => (
              <View
                key={size}
                style={{
                  position: "absolute",
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  borderWidth: index === 2 ? 0 : 2,
                  borderColor: colors.green,
                  borderStyle: index === 0 ? "dashed" : "solid",
                  backgroundColor: index === 2 ? (inside === false ? colors.coral : colors.green) : index === 1 ? `${colors.green}22` : "transparent",
                  opacity: index === 0 ? 0.7 : 1,
                }}
              />
            ))}
            <View
              style={{
                position: "absolute",
                top: 12,
                left: 12,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: colors.paper,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: duty && inside === false ? colors.coral : colors.green }} />
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.ink }}>
                {duty
                  ? inside === false
                    ? "Outside work area"
                    : inside
                      ? "Inside work area"
                      : "On duty · sharing location"
                  : doneToday
                    ? "Off duty · not tracking"
                    : "Ready to check in"}
              </Text>
            </View>
          </View>
          <View style={{ padding: 18 }}>
            <Text style={{ fontSize: 11, color: colors.ink3, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase" }}>
              {duty ? "Checked in" : doneToday ? "Done for today" : "Today's site"}
            </Text>
            <Text style={{ fontSize: 18, fontWeight: "700", marginTop: 2, letterSpacing: -0.4, color: colors.ink }}>{siteName}</Text>
            <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 4 }}>
              {duty
                ? `Checked in at ${clock(duty.since)}${duty.site ? ` · ${duty.site}` : ""}${duty.waiting ? " · saved on this phone" : ""}`
                : doneToday
                  ? "You already clocked in and out today. Location sharing has stopped. You can clock in again tomorrow."
                  : site
                    ? `${site.address || `${site.lat.toFixed(4)}, ${site.lng.toFixed(4)}`} · ${site.radiusM}m radius${metres !== null ? ` · ${metres} m away` : ""}`
                    : "Ask your manager to add a site, then stand inside the fence."}
            </Text>
            {duty ? (
              <Pressable style={styles.greenButton} disabled={busy} onPress={() => void checkOut()}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Icon name="check" size={22} color={colors.ink} />
                  <Text style={styles.greenButtonText}>{busy ? "Checking out" : "Check out"}</Text>
                </View>
              </Pressable>
            ) : doneToday ? (
              <View style={[styles.greenButton, { opacity: 0.55 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Icon name="check" size={22} color={colors.ink} />
                  <Text style={styles.greenButtonText}>Checked out · see you tomorrow</Text>
                </View>
              </View>
            ) : (
              <>
                <Pressable style={styles.greenButton} disabled={busy || granted !== true || alwaysOn !== true} onPress={() => void checkIn()}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Icon name="check" size={22} color={colors.ink} />
                    <Text style={styles.greenButtonText}>{busy ? "Checking in…" : "Tap to Check-In"}</Text>
                  </View>
                </Pressable>
                <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <Icon name="camera" size={14} color={colors.ink3} />
                  <Text style={{ fontSize: 11, color: colors.ink3 }}>Selfie will be captured on check-in</Text>
                </View>
              </>
            )}
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          {[
            ["Hours", compactHours(liveHours), colors.greenDeep],
            ["This week", compactHours(hoursWeek), colors.ink],
            ["Streak", `${streak} day${streak === 1 ? "" : "s"}`, colors.amber],
          ].map(([label, value, color]) => (
            <View key={label} style={[styles.card, { flex: 1, padding: 12, marginBottom: 0 }]}>
              <Text style={{ fontSize: 10, color: colors.ink3, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase" }}>{label}</Text>
              <Text style={{ fontSize: 16, fontWeight: "700", color, marginTop: 4 }}>{value}</Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink }}>Today&apos;s schedule</Text>
            <Pressable onPress={() => router.push("/tasks")}>
              <Text style={{ fontSize: 11, color: colors.greenDeep, fontWeight: "600" }}>
                {schedule.length} item{schedule.length === 1 ? "" : "s"} · See all
              </Text>
            </Pressable>
          </View>
          <View style={[styles.card, { padding: 0 }]}>
            {schedule.length === 0 ? (
              <Text style={[styles.sub, { padding: 16, marginBottom: 0 }]}>No visits or tasks lined up yet. New work shows here, not only in More.</Text>
            ) : (
              schedule.map((row, index) => (
                <Pressable
                  key={`${row.id}-${index}`}
                  onPress={() => router.push(row.href)}
                  style={{
                    flexDirection: "row",
                    gap: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    alignItems: "center",
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: colors.cream2,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.ink3, width: 48 }}>{row.when}</Text>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: index === 0 ? colors.green : colors.ink4 }} />
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: "500", color: colors.ink }}>{row.title}</Text>
                  <Text style={{ color: colors.ink4 }}>›</Text>
                </Pressable>
              ))
            )}
          </View>
        </View>
      </View>
    </ScrollView>
    </ScreenShell>
  );
}
