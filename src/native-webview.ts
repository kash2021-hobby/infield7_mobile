import type { ComponentType } from "react";
import RNWebView from "react-native-webview";

export type { WebViewMessageEvent } from "react-native-webview";
export type NativeWebView = InstanceType<typeof RNWebView>;

/** RN 0.88 strict types currently mark react-native-webview props as `never`. */
export const WebView = RNWebView as unknown as ComponentType<Record<string, unknown>>;
