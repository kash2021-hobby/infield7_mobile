import Svg, { Circle, Path, Rect } from "react-native-svg";

export type IconName =
  | "home"
  | "map"
  | "pin"
  | "users"
  | "user"
  | "bell"
  | "calendar"
  | "wallet"
  | "search"
  | "filter"
  | "check"
  | "clock"
  | "alert"
  | "camera"
  | "download"
  | "logout"
  | "settings"
  | "chevronRight"
  | "chevronLeft"
  | "plus"
  | "building"
  | "truck"
  | "briefcase"
  | "phone"
  | "message"
  | "target"
  | "close"
  | "arrowUpRight";

export function Icon({
  name,
  size = 22,
  color = "#1C2430",
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const p = {
    fill: "none" as const,
    stroke: color,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === "home" ? <Path {...p} d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-4v-6h-6v6H5a1 1 0 01-1-1v-9z" /> : null}
      {name === "map" ? (
        <>
          <Path {...p} d="M9 3L3 6v15l6-3 6 3 6-3V3l-6 3-6-3z" />
          <Path {...p} d="M9 3v15M15 6v15" />
        </>
      ) : null}
      {name === "pin" ? (
        <>
          <Path {...p} d="M12 21s-7-7.5-7-12a7 7 0 0114 0c0 4.5-7 12-7 12z" />
          <Circle {...p} cx="12" cy="9" r="2.5" />
        </>
      ) : null}
      {name === "users" ? (
        <>
          <Circle {...p} cx="9" cy="8" r="4" />
          <Path {...p} d="M2 21c0-4 3-7 7-7s7 3 7 7" />
          <Path {...p} d="M16 3.5a4 4 0 010 8M22 21c0-3-1.5-5.5-4-6.5" />
        </>
      ) : null}
      {name === "user" ? (
        <>
          <Circle {...p} cx="12" cy="8" r="4" />
          <Path {...p} d="M4 21c0-4 3.5-7 8-7s8 3 8 7" />
        </>
      ) : null}
      {name === "bell" ? (
        <>
          <Path {...p} d="M6 8a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z" />
          <Path {...p} d="M10 20a2 2 0 004 0" />
        </>
      ) : null}
      {name === "calendar" ? (
        <>
          <Rect {...p} x="3" y="5" width="18" height="16" rx="2" />
          <Path {...p} d="M3 10h18M8 3v4M16 3v4" />
        </>
      ) : null}
      {name === "wallet" ? (
        <>
          <Path {...p} d="M3 7a2 2 0 012-2h13v14a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          <Path {...p} d="M3 7h15v4h-4a2 2 0 000 4h4" />
        </>
      ) : null}
      {name === "search" ? (
        <>
          <Circle {...p} cx="11" cy="11" r="7" />
          <Path {...p} d="M20 20l-3.5-3.5" />
        </>
      ) : null}
      {name === "filter" ? <Path {...p} d="M4 5h16l-6 8v6l-4-2v-4z" /> : null}
      {name === "check" ? <Path {...p} d="M5 12l4 4L19 6" /> : null}
      {name === "clock" ? (
        <>
          <Circle {...p} cx="12" cy="12" r="9" />
          <Path {...p} d="M12 7v5l3 2" />
        </>
      ) : null}
      {name === "alert" ? (
        <>
          <Path {...p} d="M12 3l10 18H2L12 3z" />
          <Path {...p} d="M12 10v4M12 18v.5" />
        </>
      ) : null}
      {name === "camera" ? (
        <>
          <Rect {...p} x="3" y="7" width="18" height="13" rx="2" />
          <Circle {...p} cx="12" cy="13" r="4" />
          <Path {...p} d="M9 7l2-3h2l2 3" />
        </>
      ) : null}
      {name === "download" ? (
        <>
          <Path {...p} d="M12 4v12M7 11l5 5 5-5" />
          <Path {...p} d="M4 20h16" />
        </>
      ) : null}
      {name === "logout" ? (
        <>
          <Path {...p} d="M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4" />
          <Path {...p} d="M10 8l-4 4 4 4M6 12h10" />
        </>
      ) : null}
      {name === "settings" ? (
        <>
          <Circle {...p} cx="12" cy="12" r="3" />
          <Path {...p} d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
        </>
      ) : null}
      {name === "chevronRight" ? <Path {...p} d="M9 6l6 6-6 6" /> : null}
      {name === "chevronLeft" ? <Path {...p} d="M15 6l-6 6 6 6" /> : null}
      {name === "plus" ? <Path {...p} d="M12 5v14M5 12h14" /> : null}
      {name === "building" ? (
        <>
          <Rect {...p} x="4" y="3" width="16" height="18" rx="1" />
          <Path {...p} d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M9 16h.01M15 16h.01" />
        </>
      ) : null}
      {name === "truck" ? (
        <>
          <Path {...p} d="M3 7h11v10H3zM14 10h4l3 3v4h-7z" />
          <Circle {...p} cx="7" cy="18" r="2" />
          <Circle {...p} cx="17" cy="18" r="2" />
        </>
      ) : null}
      {name === "briefcase" ? (
        <>
          <Rect {...p} x="3" y="7" width="18" height="13" rx="2" />
          <Path {...p} d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" />
        </>
      ) : null}
      {name === "phone" ? <Path {...p} d="M5 4h4l2 5-3 2a12 12 0 006 6l2-3 5 2v4a2 2 0 01-2 2A17 17 0 013 6a2 2 0 012-2z" /> : null}
      {name === "message" ? <Path {...p} d="M4 5h16v12H8l-4 4V5z" /> : null}
      {name === "close" ? <Path {...p} d="M6 6l12 12M18 6L6 18" /> : null}
      {name === "arrowUpRight" ? <Path {...p} d="M7 17L17 7M9 7h8v8" /> : null}
      {name === "target" ? (
        <>
          <Circle {...p} cx="12" cy="12" r="9" />
          <Circle {...p} cx="12" cy="12" r="5" />
          <Circle {...p} cx="12" cy="12" r="1" fill={color} />
        </>
      ) : null}
    </Svg>
  );
}
