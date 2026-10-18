import type { SceneReview } from "../../shared/model.ts";
import { reviewDiff } from "./diffParser.ts";
import { navigationContext } from "../../shared/referenceLinks.ts";
import { godotFileKind } from "../../shared/fileTypes.ts";

type RecordValue = Record<string, unknown>;
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
export function reviewGithubData(value: unknown, changesUrl: string) {
  const payload = record(record(value).payload);
  const route = record(
    payload.pullRequestsChangesRoute ?? payload.pullRequestsChangesWithRangeRoute,
  );
  if (!Array.isArray(route.diffSummaries)) return undefined;
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
        (godotFileKind(file.path) ||
          godotFileKind(
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
      const review = reviewDiff(patch)[0];
      if (!review) throw new Error("GitHub returned an unreadable Godot file path.");
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
        review.diagnostics = [
          "GitHub has not loaded this file's text. Open its original diff; SceneSleuth updates as it loads.",
        ];
      } else if (content?.isTooBig || content?.truncatedReason) {
        review.coverage = "partial";
        review.diagnostics.push(
          "GitHub limited this diff. Some changes may be missing; use the original file for the full context.",
        );
      }
      return review;
    });
  return { comparisonKey: JSON.stringify(route.comparison), files, navigation };
}
