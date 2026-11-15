import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type NativeWebView, type WebViewMessageEvent } from "@/native-webview";
import { api } from "@/api";
import { Avatar, FilterChip, IconBtn, ScreenShell } from "@/chrome";
import { Icon } from "@/icons";
import { mapHtml, type MapPerson, type MapSite } from "@/mapHtml";
import { loadSession } from "@/session";
import { colors, styles } from "@/theme";

type Presence = MapPerson & {
  recordedAt: string;
  checkedInAt?: string | null;
  distanceM?: number | null;
  fenceM?: number | null;
  beyondM?: number | null;
};
type Employee = { userId: string | null; name: string; phone: string; department: string | null; jobTitle: string | null; status: string };
type Alert = { id: string; userId: string | null; person: string | null; message: string; kind: string; status: string; createdAt?: string };
type DutyRow = { userId: string; since: string };
type PinStatus = "onsite" | "field" | "alert" | "offline";
type Filter = "all" | PinStatus;

const POLL_MS = 30_000;

function statusOf(person: Presence, alertIds: Set<string>): Exclude<PinStatus, "offline"> {
  if (alertIds.has(person.userId)) return "alert";
  if (person.site) return "onsite";
  return "field";
}

function deptOf(employees: Employee[], userId: string | null | undefined) {
  return employees.find((row) => row.userId === userId)?.department?.trim() || "No department";
}

function groupsOf<T>(items: T[], key: (item: T) => string) {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const name = key(item);
    const list = buckets.get(name);
    if (list) list.push(item);
    else buckets.set(name, [item]);
  }
  const named = [...buckets.entries()].filter(([name]) => name !== "No department");
  named.sort((a, b) => a[0].localeCompare(b[0], "en"));
  const none = buckets.get("No department");
  if (none?.length) named.push(["No department", none]);
  return named;
}

function inDept<T>(items: T[], key: (item: T) => string, dept: string | null) {
  if (!dept) return items;
  return items.filter((item) => key(item) === dept);
}

function DeptButtons({
  groups,
  total,
  value,
  onChange,
}: {
  groups: [string, unknown[]][];
  total: number;
  value: string | null;
  onChange: (dept: string | null) => void;
}) {
  if (groups.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
      <FilterChip label={`All ${total}`} active={value === null} onPress={() => onChange(null)} />
      {groups.map(([dept, rows]) => (
        <FilterChip key={dept} label={`${dept} ${rows.length}`} active={value === dept} onPress={() => onChange(dept)} />
      ))}
    </View>
  );
}

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function ago(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} h ago`;
}

function hoursSince(iso: string) {
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (hours < 0) return "—";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export default function LiveMap() {
  const web = useRef<NativeWebView>(null);
  const [people, setPeople] = useState<Presence[]>([]);
  const [sites, setSites] = useState<MapSite[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [alertIds, setAlertIds] = useState<Set<string>>(new Set());
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [duty, setDuty] = useState<Record<string, DutyRow>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  const [error, setError] = useState("");
  const params = useLocalSearchParams<{ userId?: string; filter?: string; q?: string }>();
  const focusId = typeof params.userId === "string" ? params.userId : null;

  const refresh = useCallback(async () => {
    const session = await loadSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    if (session.user.role === "employee") {
      router.replace("/check-in");
      return;
    }
    const [presence, roster, alerts, board] = await Promise.all([
      api<{ people: Presence[]; sites: MapSite[] }>("/presence", {}, session.token),
      api<{ employees: Employee[] }>("/employees", {}, session.token),
      api<{ alerts: Alert[] }>("/alerts", {}, session.token),
      api<{ onDuty: DutyRow[] }>("/on-duty", {}, session.token),
    ]);
    setPeople(presence.people);
    setSites(presence.sites);
    setEmployees(roster.employees);
    setAlerts(alerts.alerts);
    setAlertIds(new Set(
      alerts.alerts.filter((row) => row.userId && (row.status === "open" || row.status === "escalated")).map((row) => row.userId as string),
    ));
    setDuty(Object.fromEntries(board.onDuty.map((row) => [row.userId, row])));
    setError("");
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
      const timer = setInterval(() => {
        refresh().catch(() => undefined);
      }, POLL_MS);
      return () => clearInterval(timer);
    }, [refresh]),
  );

  useEffect(() => {
    const next = params.filter;
    if (next === "onsite" || next === "field" || next === "offline" || next === "alert") setFilter(next);
    if (typeof params.q === "string" && params.q) setQuery(params.q);
  }, [params.filter, params.q]);

  useEffect(() => {
    if (focusId && people.some((person) => person.userId === focusId)) setSelectedId(focusId);
  }, [focusId, people]);

  const liveIds = useMemo(() => new Set(people.map((person) => person.userId)), [people]);
  const offlinePeople = useMemo(
    () => employees.filter((row) => row.status === "active" && row.userId && !liveIds.has(row.userId)),
    [employees, liveIds],
  );

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return people.filter((person) => {
      const status = statusOf(person, alertIds);
      if (filter !== "all" && filter !== "offline" && status !== filter) return false;
      if (filter === "offline") return false;
      if (deptFilter && deptOf(employees, person.userId) !== deptFilter) return false;
      if (!needle) return true;
      return person.person.toLowerCase().includes(needle) || (person.site ?? "").toLowerCase().includes(needle);
    }).map((person) => ({ ...person, status: statusOf(person, alertIds) }));
  }, [people, query, filter, alertIds, deptFilter, employees]);

  const openAlerts = useMemo(
    () => alerts.filter((row) => row.status === "open" || row.status === "escalated"),
    [alerts],
  );
  const travelling = useMemo(
    () => people.filter((person) => statusOf(person, alertIds) === "field"),
    [people, alertIds],
  );

  const counts = useMemo(() => {
    let onsite = 0;
    let field = 0;
    for (const person of people) {
      const status = statusOf(person, alertIds);
      if (status === "onsite") onsite += 1;
      else if (status === "field") field += 1;
    }
    return { onsite, field, alert: openAlerts.length, offline: offlinePeople.length };
  }, [people, alertIds, offlinePeople.length, openAlerts.length]);

  function pickFilter(next: Filter) {
    setFilter(next);
    setSelectedId(null);
    setSelectedSiteId(null);
    setDeptFilter(null);
  }

  const insets = useSafeAreaInsets();
  const selected = people.find((person) => person.userId === selectedId) ?? null;
  const selectedEmployee = employees.find((row) => row.userId === selectedId);
  const selectedStatus = selected ? statusOf(selected, alertIds) : null;
  const selectedSite = sites.find((site) => site.id === selectedSiteId) ?? null;
  const atSite = useMemo(() => {
    if (!selectedSite) return [];
    return people.filter((person) => person.site === selectedSite.name);
  }, [people, selectedSite]);
  const html = useMemo(() => mapHtml(shown, sites), [shown, sites]);

  const labels: Record<PinStatus, string> = {
    onsite: "On-site",
    field: "Travelling",
    alert: "Alert",
    offline: "Offline",
  };

  function inject(js: string) {
    web.current?.injectJavaScript(`${js}; true;`);
  }

  function choose(userId: string) {
    setSelectedId(userId);
    inject(`window.focusPerson && window.focusPerson(${JSON.stringify(userId)})`);
  }

  function chooseSite(id: string) {
    const site = sites.find((row) => row.id === id);
    setSelectedSiteId(id);
    setSelectedId(null);
    setDeptFilter(null);
    if (site) inject(`window.focusSite && window.focusSite(${site.lng}, ${site.lat})`);
  }

  function onMapMessage(event: WebViewMessageEvent) {
    const raw = event.nativeEvent.data;
    try {
      const payload = JSON.parse(raw) as { type?: string; id?: string };
      if (payload.type === "site" && payload.id) {
        chooseSite(payload.id);
        return;
      }
      if (payload.type === "person" && payload.id) {
        setSelectedSiteId(null);
        choose(payload.id);
        return;
      }
    } catch {
      /* older pins posted a bare user id */
    }
    if (raw) {
      setSelectedSiteId(null);
      choose(raw);
    }
  }

  async function openLink(kind: "tel" | "sms") {
    const phone = selectedEmployee?.phone;
    if (!phone) return;
    await Linking.openURL(`${kind}:${phone}`);
  }

  const roleChip = selectedEmployee?.jobTitle || selectedEmployee?.department || (selectedStatus ? labels[selectedStatus] : "");

  return (
    <ScreenShell>
      <View style={{ flex: 1, backgroundColor: colors.cream2 }}>
        <WebView
          ref={web}
          originWhitelist={["*"]}
          source={{ html }}
          onMessage={onMapMessage}
          onLoadEnd={() => {
            if (selectedId) inject(`window.focusPerson && window.focusPerson(${JSON.stringify(selectedId)})`);
          }}
          style={{ flex: 1, backgroundColor: colors.cream2 }}
        />

        <View style={{ position: "absolute", top: insets.top + 8, left: 14, right: 14 }} pointerEvents="box-none">
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                backgroundColor: colors.paper,
                borderRadius: 999,
                paddingHorizontal: 14,
                height: 44,
                shadowColor: "#000",
                shadowOpacity: 0.1,
                shadowRadius: 14,
                elevation: 3,
              }}
            >
              <Icon name="search" size={16} color={colors.ink3} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search employees, sites…"
                placeholderTextColor={colors.ink3}
                style={{ flex: 1, fontSize: 13, color: colors.ink, paddingVertical: 0 }}
              />
            </View>
            <IconBtn icon="filter" onPress={() => setFiltersOpen((open) => !open)} />
          </View>
          {filtersOpen ? (
            <View style={{ flexDirection: "row", gap: 6, marginTop: 10, flexWrap: "wrap", maxWidth: 280 }}>
              <FilterChip label={`All ${people.length + offlinePeople.length}`} active={filter === "all"} onPress={() => pickFilter("all")} />
              <FilterChip label={`On-site ${counts.onsite}`} active={filter === "onsite"} onPress={() => pickFilter("onsite")} />
              <FilterChip label={`Travelling ${counts.field}`} active={filter === "field"} onPress={() => pickFilter("field")} />
              <FilterChip label={`Alert ${counts.alert}`} active={filter === "alert"} onPress={() => pickFilter("alert")} />
              <FilterChip label={`Offline ${counts.offline}`} active={filter === "offline"} onPress={() => pickFilter("offline")} />
            </View>
          ) : null}
        </View>

        <View style={{ position: "absolute", right: 14, bottom: selected || selectedSite ? 280 : 180, gap: 8 }}>
          <IconBtn icon="target" tone="green" onPress={() => inject("window.fitAll && window.fitAll()")} />
          <IconBtn icon="plus" onPress={() => inject("window.zoomIn && window.zoomIn()")} />
        </View>

        {error ? <Text style={[styles.error, { position: "absolute", top: insets.top + 70, left: 16, right: 16 }]}>{error}</Text> : null}

        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.paper,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 20,
            paddingTop: 10,
            paddingBottom: 18,
            maxHeight: "52%",
            shadowColor: "#000",
            shadowOpacity: 0.08,
            shadowRadius: 24,
            elevation: 8,
          }}
        >
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.ink4, alignSelf: "center", marginBottom: 14 }} />
          {selected && selectedStatus ? (
            <>
              {selectedSite || selected.site ? (
                <Pressable
                  onPress={() => {
                    if (selectedSite) {
                      setSelectedId(null);
                      return;
                    }
                    const site = sites.find((row) => row.name === selected.site);
                    if (site) chooseSite(site.id);
                  }}
                  style={{ marginBottom: 10 }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.ink2 }}>
                    ← {selectedSite ? `${atSite.length} at ${selectedSite.name}` : `Everyone at ${selected.site}`}
                  </Text>
                </Pressable>
              ) : null}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Avatar name={selected.person} size={48} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink }}>{selected.person}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: selectedStatus === "onsite" ? colors.green : selectedStatus === "field" ? colors.amber : colors.coral }} />
                    <Text style={{ fontSize: 12, color: colors.ink3 }}>
                      {labels[selectedStatus]}
                      {selected.site ? ` · ${selected.site}` : ""}
                      {` · last check-in ${ago(selected.recordedAt)}`}
                    </Text>
                  </View>
                </View>
                <View style={{ backgroundColor: selectedStatus === "onsite" ? colors.greenSoft : selectedStatus === "field" ? colors.amberSoft : colors.coralSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ color: selectedStatus === "onsite" ? colors.greenDeep : selectedStatus === "field" ? "#8A5A10" : colors.coral, fontSize: 11, fontWeight: "700" }}>
                    {roleChip}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
                {[
                  ["Clock-in", selected.checkedInAt ? clock(selected.checkedInAt) : duty[selected.userId] ? clock(duty[selected.userId].since) : "—"],
                  [
                    "How far",
                    selected.beyondM != null && selected.beyondM > 0 && selected.distanceM != null && selected.fenceM != null
                      ? `${selected.beyondM} m past fence`
                      : selected.distanceM != null
                        ? `${selected.distanceM} m from centre`
                        : selected.site ?? "Outside",
                  ],
                  ["On duty", duty[selected.userId] ? hoursSince(duty[selected.userId].since) : "—"],
                ].map(([label, value]) => (
                  <View key={label} style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.cream }}>
                    <Text style={{ fontSize: 10, color: colors.ink3, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase" }}>{label}</Text>
                    <Text style={{ fontSize: 13, fontWeight: "700", marginTop: 3, color: colors.ink }}>{value}</Text>
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <Pressable
                  onPress={() => openLink("tel")}
                  disabled={!selectedEmployee?.phone}
                  style={{
                    flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: colors.ink,
                    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                    opacity: selectedEmployee?.phone ? 1 : 0.45,
                  }}
                >
                  <Icon name="phone" size={16} color={colors.paper} />
                  <Text style={{ color: colors.paper, fontWeight: "600", fontSize: 14 }}>Call</Text>
                </Pressable>
                <Pressable
                  onPress={() => openLink("sms")}
                  disabled={!selectedEmployee?.phone}
                  style={{
                    flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: colors.paper,
                    borderWidth: 1, borderColor: colors.cream2,
                    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                    opacity: selectedEmployee?.phone ? 1 : 0.45,
                  }}
                >
                  <Icon name="message" size={16} color={colors.ink} />
                  <Text style={{ color: colors.ink, fontWeight: "600", fontSize: 14 }}>Message</Text>
                </Pressable>
              </View>
            </>
          ) : filter === "alert" ? (
            <>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink }}>Alerts</Text>
              <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 4, marginBottom: 4 }}>
                {openAlerts.length === 0 ? "No open alerts." : `${openAlerts.length} open now`}
              </Text>
              <DeptButtons
                groups={groupsOf(openAlerts, (row) => deptOf(employees, row.userId))}
                total={openAlerts.length}
                value={deptFilter}
                onChange={setDeptFilter}
              />
              <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled>
                {inDept(openAlerts, (row) => deptOf(employees, row.userId), deptFilter).map((row) => {
                  const live = people.find((person) => person.userId === row.userId);
                  return (
                    <Pressable
                      key={row.id}
                      onPress={() => { if (live) choose(live.userId); }}
                      style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.cream2 }}
                    >
                      <Avatar name={row.person ?? "Alert"} size={36} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.ink }}>{row.person ?? "Unknown"}</Text>
                        <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>{row.message}</Text>
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: colors.coral }}>Alert</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          ) : filter === "offline" ? (
            <>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink }}>Offline</Text>
              <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 4, marginBottom: 4 }}>
                {offlinePeople.length === 0 ? "Everyone has a live pin." : `${offlinePeople.length} with no live pin`}
              </Text>
              <DeptButtons
                groups={groupsOf(offlinePeople, (row) => row.department?.trim() || "No department")}
                total={offlinePeople.length}
                value={deptFilter}
                onChange={setDeptFilter}
              />
              <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled>
                {inDept(offlinePeople, (row) => row.department?.trim() || "No department", deptFilter).map((row) => (
                  <View
                    key={row.userId}
                    style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.cream2 }}
                  >
                    <Avatar name={row.name} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.ink }}>{row.name}</Text>
                      <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>{row.jobTitle || row.department || "Staff"}</Text>
                    </View>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: colors.ink3 }}>Offline</Text>
                  </View>
                ))}
              </ScrollView>
            </>
          ) : filter === "field" ? (
            <>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink }}>Travelling</Text>
              <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 4, marginBottom: 4 }}>
                {travelling.length === 0 ? "Nobody travelling right now." : `${travelling.length} on the move`}
              </Text>
              <DeptButtons
                groups={groupsOf(travelling, (person) => deptOf(employees, person.userId))}
                total={travelling.length}
                value={deptFilter}
                onChange={setDeptFilter}
              />
              <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled>
                {inDept(travelling, (person) => deptOf(employees, person.userId), deptFilter).map((person) => {
                  const row = employees.find((item) => item.userId === person.userId);
                  return (
                    <Pressable
                      key={person.userId}
                      onPress={() => choose(person.userId)}
                      style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.cream2 }}
                    >
                      <Avatar name={person.person} size={36} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.ink }}>{person.person}</Text>
                        <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>{row?.jobTitle || row?.department || "Staff"}</Text>
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: "#8A5A10" }}>Travelling</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          ) : selectedSite ? (
            <>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink }}>{selectedSite.name}</Text>
              <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 4, marginBottom: 4 }}>
                {atSite.length === 0 ? "Nobody on this site right now." : `${atSite.length} on site now`}
              </Text>
              <DeptButtons
                groups={groupsOf(atSite, (person) => deptOf(employees, person.userId))}
                total={atSite.length}
                value={deptFilter}
                onChange={setDeptFilter}
              />
              <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled>
              {inDept(atSite, (person) => deptOf(employees, person.userId), deptFilter).map((person) => {
                const status = statusOf(person, alertIds);
                const row = employees.find((item) => item.userId === person.userId);
                return (
                  <Pressable
                    key={person.userId}
                    onPress={() => choose(person.userId)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.cream2 }}
                  >
                    <Avatar name={person.person} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.ink }}>{person.person}</Text>
                      <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>
                        {row?.jobTitle || row?.department || labels[status]}
                        {duty[person.userId] ? ` · ${hoursSince(duty[person.userId].since)}` : ""}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: status === "onsite" ? colors.greenDeep : colors.ink3 }}>{labels[status]}</Text>
                  </Pressable>
                );
              })}
              </ScrollView>
            </>
          ) : sites.length > 0 ? (
            <>
              <DeptButtons
                groups={groupsOf(people, (person) => deptOf(employees, person.userId))}
                total={people.length}
                value={deptFilter}
                onChange={setDeptFilter}
              />
              <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled>
                {deptFilter
                  ? inDept(people, (person) => deptOf(employees, person.userId), deptFilter).map((person) => {
                    const status = statusOf(person, alertIds);
                    const row = employees.find((item) => item.userId === person.userId);
                    return (
                      <Pressable
                        key={person.userId}
                        onPress={() => choose(person.userId)}
                        style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.cream2 }}
                      >
                        <Avatar name={person.person} size={36} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.ink }}>{person.person}</Text>
                          <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>
                            {row?.jobTitle || labels[status]}
                            {person.site ? ` · ${person.site}` : ""}
                            {duty[person.userId] ? ` · ${hoursSince(duty[person.userId].since)}` : ""}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: status === "onsite" ? colors.greenDeep : colors.ink3 }}>{labels[status]}</Text>
                      </Pressable>
                    );
                  })
                  : sites.map((site) => {
                    const n = people.filter((person) => person.site === site.name).length;
                    return (
                      <Pressable
                        key={site.id}
                        onPress={() => chooseSite(site.id)}
                        style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.cream2 }}
                      >
                        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.greenSoft, alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ color: colors.greenDeep, fontWeight: "700" }}>◯</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.ink }}>{site.name}</Text>
                          <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>
                            {n === 0 ? "Nobody on site right now" : `${n} on site now`}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
              </ScrollView>
            </>
          ) : (
            <Text style={[styles.sub, { marginBottom: 4 }]}>
              {people.length === 0
                ? "Nobody with a live pin yet. People appear after they check in and share location."
                : "Tap a site below, or the Site button on the map."}
            </Text>
          )}
        </View>
      </View>
    </ScreenShell>
  );
}
