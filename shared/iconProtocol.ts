import { reviewContext } from "./protocol.ts";
import type { EngineTheme } from "./reviewTheme.ts";

export interface IconThemeMessage {
  action: "SET_ICON_THEME";
  theme: EngineTheme;
  reviewKey: string;
}
export function iconThemeRequest(
  message: unknown,
  sender: { id?: string; frameId?: number; url?: string; tab?: { id?: number } },
  runtimeId: string,
): { tabId: number; theme: EngineTheme } | undefined {
  if (
    sender.id !== runtimeId ||
    sender.frameId !== 0 ||
    !Number.isInteger(sender.tab?.id) ||
    sender.tab!.id! < 0 ||
    !sender.url ||
    !message ||
    typeof message !== "object"
  )
    return;
  const data = message as Record<string, unknown>;
  if (
    data.action !== "SET_ICON_THEME" ||
    typeof data.theme !== "string" ||
    !["godot", "unity", "unreal", "github"].includes(String(data.theme)) ||
    typeof data.reviewKey !== "string"
  )
    return;
  let context: ReturnType<typeof reviewContext>;
  try {
    if (new URL(sender.url).origin !== "https://github.com") return;
    context = reviewContext(sender.url);
  } catch {
    return;
  }
  if (!context?.isChangesPage) return { tabId: sender.tab!.id!, theme: "github" };
  if (data.reviewKey !== context.key && !data.reviewKey.startsWith(context.key + ":")) return;
  return { tabId: sender.tab!.id!, theme: data.theme as EngineTheme };
}
