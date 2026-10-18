import type { ReviewSnapshot } from "./model.ts";
export type ReviewAction = "GET_REVIEW" | "REFRESH_REVIEW" | "OPEN_REVIEW";
export function isReviewRequest(value: unknown): value is { action: ReviewAction } {
  return (
    typeof value === "object" &&
    value !== null &&
    "action" in value &&
    ["GET_REVIEW", "REFRESH_REVIEW", "OPEN_REVIEW"].includes(String(value.action))
  );
}
export function isReviewSnapshot(value: unknown): value is ReviewSnapshot {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return (
    typeof data.reviewKey === "string" &&
    typeof data.title === "string" &&
    ["loading", "ready", "error"].includes(String(data.status)) &&
    Array.isArray(data.files) &&
    (data.repositoryTheme === undefined ||
      ["github", "godot", "unity", "mixed"].includes(String(data.repositoryTheme))) &&
    (data.colorMode === undefined || ["light", "dark"].includes(String(data.colorMode))) &&
    data.files.every(
      (file) => file && typeof file.filePath === "string" && Array.isArray(file.changes),
    )
  );
}
export function reviewContext(
  url: string,
): { key: string; title: string; changesUrl: string; isChangesPage: boolean } | undefined {
  const parsed = new URL(url);
  if (parsed.hostname !== "github.com") return;
  const match = parsed.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$)/);
  if (!match) return;
  const key = `/${match[1]}/${match[2]}/pull/${match[3]}`;
  const isChangesPage = /^\/(?:files|changes)(?:\/|$)/.test(parsed.pathname.slice(key.length));
  return {
    key,
    title: `${match[1]}/${match[2]} #${match[3]}`,
    changesUrl: isChangesPage
      ? `${parsed.origin}${parsed.pathname}${parsed.search}`
      : `${parsed.origin}${key}/changes`,
    isChangesPage,
  };
}
