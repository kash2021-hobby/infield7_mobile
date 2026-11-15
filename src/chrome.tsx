import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Keyboard, Platform, Pressable, Text, View } from "react-native";
import { router, useFocusEffect, usePathname, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/api";
import { Icon, type IconName } from "@/icons";
import { resumePresence } from "@/presence";
import { registerPushOnce } from "@/push";
import { loadSession } from "@/session";
import { colors } from "@/theme";

type Tab = { id: string; label: string; href: Href; icon: IconName };

const managerTabs: Tab[] = [
  { id: "home", label: "Home", href: "/overview", icon: "home" },
  { id: "map", label: "Map", href: "/map", icon: "map" },
  { id: "team", label: "Team", href: "/team", icon: "users" },
  { id: "alerts", label: "Alerts", href: "/alerts", icon: "bell" },
  { id: "me", label: "Me", href: "/more", icon: "user" },
];

const employeeTabs: Tab[] = [
  { id: "home", label: "Home", href: "/check-in", icon: "home" },
  { id: "visits", label: "Visits", href: "/visits", icon: "pin" },
  { id: "tasks", label: "Tasks", href: "/tasks", icon: "briefcase" },
  { id: "pay", label: "Pay", href: "/payroll", icon: "wallet" },
  { id: "me", label: "More", href: "/more", icon: "user" },
];

function tabsFor(role: string) {
  return role === "employee" ? employeeTabs : managerTabs;
}

function activeId(pathname: string, role: string) {
  if (pathname.startsWith("/more")) return "me";
  if (role === "employee") {
    if (pathname.startsWith("/check-in")) return "home";
    if (pathname.startsWith("/visits")) return "visits";
    if (pathname.startsWith("/tasks") || pathname.startsWith("/task/")) return "tasks";
    if (pathname.startsWith("/payroll")) return "pay";
    return "me";
  }
  if (pathname.startsWith("/overview")) return "home";
  if (pathname.startsWith("/map")) return "map";
  if (pathname.startsWith("/team")) return "team";
  if (pathname.startsWith("/alerts")) return "alerts";
  return "me";
}

export function hueFor(name: string) {
  let hue = 0;
  for (let i = 0; i < name.length; i += 1) hue = (hue * 31 + name.charCodeAt(i)) % 360;
  return hue;
}

export function Avatar({ name, size = 38 }: { name: string; size?: number }) {
  const hue = hueFor(name || "?");
  const initials = (name || "?")
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `hsl(${hue} 45% 88%)`,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontWeight: "600", color: `hsl(${hue} 40% 28%)`, fontSize: size * 0.4 }}>{initials}</Text>
    </View>
  );
}

export function IconBtn({
  icon,
  onPress,
  tone = "neutral",
  size = 40,
}: {
  icon: IconName;
  onPress?: () => void;
  tone?: "neutral" | "green" | "coral";
  size?: number;
}) {
  const bg = tone === "green" ? colors.greenSoft : tone === "coral" ? colors.coralSoft : colors.paper;
  const fg = tone === "green" ? colors.greenDeep : tone === "coral" ? colors.coral : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: colors.cream2,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name={icon} size={size * 0.5} color={fg} />
    </Pressable>
  );
}

export function BackBtn() {
  return <IconBtn icon="chevronLeft" onPress={() => router.back()} />;
}

export function MenuRow({
  label,
  hint,
  onPress,
  icon,
}: {
  label: string;
  hint?: string;
  onPress: () => void;
  icon?: IconName;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: colors.paper,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.cream2,
        padding: 16,
        marginBottom: 10,
      }}
    >
      {icon ? (
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: colors.cream,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} size={18} color={colors.ink} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink }}>{label}</Text>
        {hint ? <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 3 }}>{hint}</Text> : null}
      </View>
      <Icon name="chevronRight" size={16} color={colors.ink4} />
    </Pressable>
  );
}

export function TopBar({
  title,
  subtitle,
  left,
  right,
  safe = true,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  safe?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 20,
        paddingTop: (safe ? insets.top : 0) + 10,
        paddingBottom: 12,
      }}
    >
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.ink, letterSpacing: -0.4, lineHeight: 24 }}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: 12, color: colors.ink3, marginTop: 2, fontWeight: "500" }}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: active ? colors.ink : colors.paper,
        borderWidth: 1,
        borderColor: active ? colors.ink : colors.cream2,
      }}
    >
      <Text style={{ color: active ? colors.paper : colors.ink, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", (event) => {
      setHeight(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

export function ScreenShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const [role, setRole] = useState<string | null>(null);
  const [badge, setBadge] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      loadSession()
        .then(async (session) => {
          if (!session || !live) return;
          setRole(session.user.role);
          registerPushOnce(session);
          if (session.user.role === "employee") {
            setBadge(0);
            resumePresence();
            return;
          }
          try {
            const body = await api<{ alerts: { status: string }[] }>("/alerts", {}, session.token);
            if (!live) return;
            setBadge(body.alerts.filter((alert) => alert.status === "open" || alert.status === "escalated").length);
          } catch {
            if (live) setBadge(0);
          }
        })
        .catch(() => undefined);
      return () => {
        live = false;
      };
    }, []),
  );

  const tabs = role ? tabsFor(role) : [];
  const active = role ? activeId(pathname, role) : "";

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }}>
      <View style={{ flex: 1, paddingBottom: keyboard }}>{children}</View>
      {keyboard > 0 ? null : (
      <View
        style={{
          flexDirection: "row",
          backgroundColor: colors.paper,
          borderTopWidth: 1,
          borderTopColor: colors.cream2,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 6),
          paddingHorizontal: 4,
          justifyContent: "space-around",
        }}
      >
        {tabs.map((tab) => {
          const on = tab.id === active;
          return (
            <Pressable
              key={tab.id}
              onPress={() => {
                if (!on) router.replace(tab.href);
              }}
              style={{
                alignItems: "center",
                gap: 3,
                paddingVertical: 4,
                paddingHorizontal: 12,
                borderRadius: 12,
                backgroundColor: on ? colors.greenSoft : "transparent",
                minWidth: 56,
              }}
            >
              <View>
                <Icon name={tab.icon} size={22} color={on ? colors.greenDeep : colors.ink3} strokeWidth={on ? 2.4 : 2} />
                {tab.id === "alerts" && badge > 0 ? (
                  <View
                    style={{
                      position: "absolute",
                      top: -4,
                      right: -10,
                      minWidth: 16,
                      height: 16,
                      borderRadius: 8,
                      backgroundColor: colors.coral,
                      alignItems: "center",
                      justifyContent: "center",
                      paddingHorizontal: 4,
                    }}
                  >
                    <Text style={{ color: colors.paper, fontSize: 9, fontWeight: "700" }}>{badge > 9 ? "9+" : badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={{ fontSize: 10, fontWeight: on ? "600" : "500", color: on ? colors.greenDeep : colors.ink3 }}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      )}
    </View>
  );
}
