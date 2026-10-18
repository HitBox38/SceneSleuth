import type { SceneReview } from "../../shared/model.ts";
import { reviewDiff } from "./diffParser.ts";
import { embeddedRouteMatches, header, reviewGithubData } from "./githubReview.ts";
import { navigationContext } from "../../shared/referenceLinks.ts";
import { godotFileKind } from "../../shared/fileTypes.ts";

export function observeGithubDiffs(root: Node, onChange: () => void) {
  const observer = new MutationObserver((records) => {
    if (
      records.some(
        (record) =>
          record.type !== "attributes" ||
          (record.target instanceof Element && record.target.matches("table")),
      )
    )
      onChange();
  });
  // GitHub can reuse a table, changing only its file identity or text nodes.
  // Do not watch style: SceneSleuth switches the original table's display.
  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["aria-label", "data-diff-anchor"],
  });
  return observer;
}

// Modern GitHub renders additional files on demand. Read those tables without
// clicking controls, changing review preferences, or requesting private API tokens.
export function reviewGithubTable(table: Element, previous?: SceneReview): SceneReview | undefined {
  const path = table.getAttribute("aria-label")?.replace(/^Diff for: /, "");
  if (!path || (!godotFileKind(path) && !godotFileKind(previous?.previousPath))) return;
  const lines: string[] = [];
  for (const row of table.querySelectorAll("tr")) {
    const hunk = row.querySelector(".diff-hunk-cell");
    if (hunk && /^@@ -\d/.test(hunk.textContent ?? "")) {
      lines.push(hunk.textContent ?? "");
      continue;
    }
    const cells = Array.from(row.querySelectorAll(".diff-text-cell[data-line-number]"));
    const seen = new Set<string>();
    for (const cell of cells) {
      const key = cell.getAttribute("data-diff-line-key") ?? "";
      if (!/^b:\d+-l:(?:\d+|null)-r:(?:\d+|null)$/.test(key)) continue;
      const text = cell.textContent ?? "";
      const operation = text.startsWith("+") ? "+" : text.startsWith("-") ? "-" : " ";
      const id = `${operation}:${key}`;
      if (seen.has(id)) continue; // Split view repeats context on both sides.
      seen.add(id);
      lines.push(
        operation + (operation === " " ? text : text.startsWith(operation) ? text.slice(1) : text),
      );
    }
  }
  if (!lines.length) return;
  const review = reviewDiff(
    header(path, previous?.previousPath ?? path, previous?.status ?? "modified") + lines.join("\n"),
  )[0];
  if (review) {
    review.reviewUrl = previous?.reviewUrl;
    review.status = previous?.status ?? review.status;
  }
  return review;
}

export function readGithubReview(document: Document, changesUrl: string) {
  let data: ReturnType<typeof reviewGithubData>;
  for (const script of document.querySelectorAll('script[data-target="react-app.embeddedData"]')) {
    if (
      !script.textContent ||
      !embeddedRouteMatches(script.closest("react-app")?.getAttribute("initial-path"), changesUrl)
    )
      continue;
    if (script.textContent.length > 8_000_000)
      throw new Error(
        "This GitHub review exceeds the current 8 MB page-data limit. Use GitHub's file filters to narrow the review, then refresh SceneSleuth.",
      );
    try {
      data = reviewGithubData(JSON.parse(script.textContent), changesUrl);
      if (data) break;
    } catch {
      /* A loading page may not yet have a complete data payload. */
    }
  }
  const tables = document.querySelectorAll('table[aria-label^="Diff for: "]');
  if (!data && !tables.length) return;
  const files = new Map(data?.files.map((file) => [file.filePath, file]));
  const navigation = data?.navigation ?? navigationContext(changesUrl);
  const targets = new Map(navigation?.files.map((file) => [file.path, file]));
  // The native tree retains paths and anchors for binary and not-yet-loaded files.
  for (const item of document.querySelectorAll('[role="treeitem"][id]')) {
    const anchor = item.querySelector('a[href^="#diff-"]');
    const path = item.getAttribute("id");
    if (path && anchor?.closest('[role="treeitem"]') === item && !targets.has(path))
      targets.set(path, {
        path,
        status: "modified",
        reviewUrl: `${changesUrl}${anchor.getAttribute("href")}`,
      });
  }
  for (const table of tables) {
    const path = table.getAttribute("aria-label")?.slice(10) ?? "";
    const previous = files.get(path);
    // Page tables can be virtualized. Prefer the embedded patch unless the table
    // contains more source lines (for example after expanding context).
    const review = reviewGithubTable(table, previous);
    const anchor = table.getAttribute("data-diff-anchor");
    if (path && anchor && !targets.has(path))
      targets.set(path, {
        path,
        status: "modified",
        reviewUrl: `${changesUrl}#${encodeURIComponent(anchor)}`,
      });
    if (review && !review.reviewUrl && anchor)
      review.reviewUrl = `${changesUrl}#${encodeURIComponent(anchor)}`;
    if (
      review &&
      (previous?.pending || !previous || review.rawDiff.length > previous.rawDiff.length)
    )
      files.set(review.filePath, review);
  }
  if (navigation) navigation.files = [...targets.values()];
  return {
    comparisonKey: data?.comparisonKey ?? `rendered:${changesUrl}`,
    files: [...files.values()],
    partialListing: !data,
    navigation,
  };
}
