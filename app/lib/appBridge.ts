/* eslint-disable @typescript-eslint/no-explicit-any */
// app/lib/appBridge.ts
import { createApp, type ClientApplication } from "@shopify/app-bridge";

export function getAppBridge(): ClientApplication | null {
  if (typeof window === "undefined") return null;

  const qs = new URLSearchParams(window.location.search);
  const host = qs.get("host") || window.sessionStorage.getItem("shopify_host") || undefined;
  const apiKey = (window as any).__SHOPIFY_API_KEY__ as string | undefined;

  if (!host || !apiKey) return null;

  try {
    return createApp({ apiKey, host, forceRedirect: true });
  } catch {
    return null;
  }
}
