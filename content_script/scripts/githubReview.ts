import type { SceneReview } from "../../shared/model.ts";
import { reviewDiff } from "./diffParser.ts";
import { navigationContext } from "../../shared/referenceLinks.ts";
import { unityMetaGuids } from "../../shared/unityMeta.ts";
import { supportedFileKind } from "../../shared/fileTypes.ts";

type RecordValue = Record<string, unknown>;
export interface GithubLoadSource {
  changesUrl: string;
  comparisonKey: string;
  baseOid: string;
  headOid: string;
  fullBaseOid: string;
  hideWhitespace: boolean;
  summaries: RecordValue[];
}
// GitHub's repo SPA can retain the initial page's script after navigating to
// another PR. Its react-app initial-path identifies which URL owns that data.
export function embeddedRouteMatches(initialPath: string | null | undefined, changesUrl: string) {
  if (!initialPath) return true;
  try {
    const current = new URL(changesUrl);
    const initial = new URL(initialPath, current);
    return (
      initial.origin === current.origin &&
      initial.pathname === current.pathname &&
      initial.search === current.search
    );
  } catch {
    return false;
  }
}
function record(value: unknown): RecordValue {
  return value && typeof value === "object" ? (value as RecordValue) : {};
}
function status(value: unknown): SceneReview["status"] {
  switch (value) {
    case "ADDED":
      return "added";
    case "DELETED":
    case "REMOVED":
      return "removed";
    case "RENAMED":
      return "renamed";
    default:
      return "modified";
  }
}
export function header(path: string, previous: string, operation: SceneReview["status"]) {
  return `diff --git ${JSON.stringify(`a/${previous}`)} ${JSON.stringify(`b/${path}`)}\n--- ${operation === "added" ? "/dev/null" : JSON.stringify(`a/${previous}`)}\n+++ ${operation === "removed" ? "/dev/null" : JSON.stringify(`b/${path}`)}\n`;
}
export interface GithubParseCache {
  key?: string;
  files: Map<string, { patch: string; review: SceneReview }>;
}
export function cachedReview(
  patch: string,
  key: string,
  cache?: GithubParseCache,
): SceneReview | undefined {
  const previous = cache?.files.get(key);
  const parsed = previous?.patch === patch ? previous.review : reviewDiff(patch)[0];
  if (cache && parsed && previous?.patch !== patch) cache.files.set(key, { patch, review: parsed });
  return parsed ? { ...parsed, diagnostics: [...parsed.diagnostics] } : undefined;
}
export function reviewGithubData(value: unknown, changesUrl: string, cache?: GithubParseCache) {
  const payload = record(record(value).payload);
  const route = record(
    payload.pullRequestsChangesRoute ?? payload.pullRequestsChangesWithRangeRoute,
  );
  if (!Array.isArray(route.diffSummaries)) return undefined;
  const comparisonKey = JSON.stringify(route.comparison);
  const cacheKey = `${changesUrl}:${comparisonKey}`;
  if (cache && cache.key !== cacheKey) {
    cache.files.clear();
    cache.key = cacheKey;
  }
  const contents = Array.isArray(route.diffContents) ? route.diffContents.map(record) : [];
  const navigation = navigationContext(changesUrl);
  if (navigation) {
    const comparison = record(route.comparison);
    const selected = record(comparison.selectedRange);
    const full = record(comparison.fullDiff);
    const range = /\/(?:changes|files)\/.+/.test(new URL(changesUrl).pathname);
    const before =
      selected.baseOid ??
      contents.find((content) => typeof content.oldCommitOid === "string")?.oldCommitOid ??
      (!range ? full.baseOid : undefined);
    const after =
      selected.headOid ??
      contents.find((content) => typeof content.newCommitOid === "string")?.newCommitOid ??
      (!range ? full.headOid : undefined);
    navigation.beforeRevision = typeof before === "string" ? before : undefined;
    navigation.afterRevision = typeof after === "string" ? after : undefined;
    navigation.files = route.diffSummaries
      .map(record)
      .filter((summary) => typeof summary.path === "string")
      .map((summary) => {
        const content = contents.find((item) => item.path === summary.path);
        const previous = record(content?.oldTreeEntry).path;
        return {
          path: String(summary.path),
          previousPath: typeof previous === "string" ? previous : undefined,
          status: status(summary.changeType),
          ...(String(summary.path).endsWith(".meta") && Array.isArray(content?.diffLines)
            ? unityMetaGuids(
                content.diffLines.map(record).flatMap((line) => {
                  if (typeof line.text !== "string") return [];
                  if (line.type === "CONTEXT")
                    return [line.text.startsWith(" ") ? line.text : ` ${line.text}`];
                  if (line.type === "ADDITION" || line.type === "DELETION") {
                    const prefix = line.type === "ADDITION" ? "+" : "-";
                    return [line.text.startsWith(prefix) ? line.text : prefix + line.text];
                  }
                  return [];
                }),
              )
            : {}),
          reviewUrl:
            typeof summary.pathDigest === "string" && summary.pathDigest
              ? `${changesUrl}#diff-${encodeURIComponent(summary.pathDigest)}`
              : undefined,
        };
      });
  }
  const files = route.diffSummaries
    .map(record)
    .filter(
      (file) =>
        typeof file.path === "string" &&
        (supportedFileKind(file.path) ||
          supportedFileKind(
            String(
              record(contents.find((content) => content.path === file.path)?.oldTreeEntry).path ??
                "",
            ),
          )),
    )
    .map((summary) => {
      const path = String(summary.path);
      const content = contents.find((file) => file.path === path);
      const operation = status(summary.changeType);
      const previous =
        typeof record(content?.oldTreeEntry).path === "string"
          ? String(record(content?.oldTreeEntry).path)
          : path;
      const lines = Array.isArray(content?.diffLines) ? content.diffLines.map(record) : [];
      // Only text fields are consumed. GitHub's syntax-highlighted HTML is never rendered.
      const patch =
        header(path, previous, operation) +
        lines
          .filter(
            (line) =>
              ["HUNK", "ADDITION", "DELETION", "CONTEXT"].includes(String(line.type)) &&
              typeof line.text === "string",
          )
          .map((line) =>
            line.type === "CONTEXT" && !String(line.text).startsWith(" ")
              ? ` ${line.text}`
              : line.text,
          )
          .join("\n");
      const review = cachedReview(patch, JSON.stringify(["data", path]), cache);
      if (!review) throw new Error("GitHub returned an unreadable supported file path.");
      review.status = operation;
      review.reviewUrl = `${changesUrl}#diff-${encodeURIComponent(String(summary.pathDigest ?? ""))}`;
      if (
        !lines.length &&
        (!content ||
          Number(summary.linesChanged) > 0 ||
          Number(summary.linesAdded) > 0 ||
          Number(summary.linesDeleted) > 0)
      ) {
        review.pending = true;
        review.additions = Number(summary.linesAdded) || 0;
        review.deletions = Number(summary.linesDeleted) || 0;
        const generated =
          record(content?.newTreeEntry).isGenerated === true ||
          record(content?.oldTreeEntry).isGenerated === true;
        review.pendingReason = generated
          ? "generated"
          : content?.isTooBig || content?.truncatedReason
            ? "limited"
            : undefined;
        review.diagnostics = [
          generated
            ? "GitHub hides this generated file. Use its native Load Diff control to include it."
            : review.pendingReason === "limited"
              ? "GitHub limited this diff. Use its original view to inspect the available text."
              : "GitHub has not loaded this file's text. SceneSleuth will preload it when the comparison is available.",
        ];
      } else if (content?.isTooBig || content?.truncatedReason) {
        review.coverage = "partial";
        review.diagnostics.push(
          "GitHub limited this diff. Some changes may be missing; use the original file for the full context.",
        );
      }
      return review;
    });
  const comparison = record(route.comparison);
  const selected = record(comparison.selectedRange);
  const full = record(comparison.fullDiff);
  const baseOid = selected.baseOid ?? full.baseOid;
  const headOid = selected.headOid ?? full.headOid;
  const validOid = (value: unknown): value is string =>
    typeof value === "string" && /^[a-f\d]{40}$/i.test(value);
  const loadSource: GithubLoadSource | undefined =
    validOid(baseOid) && validOid(headOid) && validOid(full.baseOid)
      ? {
          changesUrl,
          comparisonKey,
          baseOid,
          headOid,
          fullBaseOid: full.baseOid,
          hideWhitespace: new URL(changesUrl).searchParams.get("w") === "1",
          summaries: route.diffSummaries.map(record),
        }
      : undefined;
  return { comparisonKey, files, navigation, loadSource };
}
