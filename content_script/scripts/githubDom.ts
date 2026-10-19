import type { SceneReview } from "../../shared/model.ts";
import { embeddedRouteMatches, header, reviewGithubData, cachedReview } from "./githubReview.ts";
import { navigationContext } from "../../shared/referenceLinks.ts";
import { unityMetaGuids } from "../../shared/unityMeta.ts";
import { supportedFileKind } from "../../shared/fileTypes.ts";
import type { GithubParseCache } from "./githubReview.ts";

export function observeGithubDiffs(root: Node, onChange: () => void) {
  const observer = new MutationObserver((records) => {
    if (
      records.some((record) => {
        if (record.type === "attributes")
          return (
            record.target instanceof Element && record.target.matches("table, react-app, html")
          );
        if (record.type === "childList") {
          const changed = [...record.addedNodes, ...record.removedNodes];
          if (
            changed.length &&
            changed.every(
              (node) =>
                node instanceof Element &&
                node.matches("[data-scenesleuth-inline], [data-scenesleuth-switch]"),
            )
          )
            return false;
        }
        return true;
      })
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
    attributeFilter: [
      "aria-label",
      "data-diff-anchor",
      "initial-path",
      "data-color-mode",
      "data-dark-theme",
      "data-light-theme",
    ],
  });
  return observer;
}

export function githubTableLines(table: Element): string[] {
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
      // Native threads and composers are siblings of the source code in this cell.
      const text = (cell.querySelector(".diff-text") ?? cell).textContent ?? "";
      const operation = text.startsWith("+") ? "+" : text.startsWith("-") ? "-" : " ";
      const id = `${operation}:${key}`;
      if (seen.has(id)) continue; // Split view repeats context on both sides.
      seen.add(id);
      lines.push(
        operation + (operation === " " ? text : text.startsWith(operation) ? text.slice(1) : text),
      );
    }
  }
  return lines;
}

// Modern GitHub renders additional files on demand. Read those tables without
// clicking controls, changing review preferences, or requesting private API tokens.
export function reviewGithubTable(
  table: Element,
  previous?: SceneReview,
  cache?: GithubParseCache,
): SceneReview | undefined {
  const path = table.getAttribute("aria-label")?.replace(/^Diff for: /, "");
  if (!path || (!supportedFileKind(path) && !supportedFileKind(previous?.previousPath))) return;
  const lines = githubTableLines(table);
  if (!lines.length) return;
  const review = cachedReview(
    header(path, previous?.previousPath ?? path, previous?.status ?? "modified") + lines.join("\n"),
    JSON.stringify(["dom", path]),
    cache,
  );
  if (review) {
    review.reviewUrl = previous?.reviewUrl;
    review.status = previous?.status ?? review.status;
  }
  return review;
}

export function readGithubReview(document: Document, changesUrl: string, cache?: GithubParseCache) {
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
      data = reviewGithubData(JSON.parse(script.textContent), changesUrl, cache);
      if (data) break;
    } catch {
      /* A loading page may not yet have a complete data payload. */
    }
  }
  const tables = document.querySelectorAll('table[aria-label^="Diff for: "]');
  if (!data && !tables.length && !document.querySelector('[role="treeitem"][id] a[href^="#diff-"]'))
    return;
  if (!data && cache && cache.key !== `rendered:${changesUrl}`) {
    cache.files.clear();
    cache.key = `rendered:${changesUrl}`;
  }
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
    const review = reviewGithubTable(table, previous, cache);
    const anchor = table.getAttribute("data-diff-anchor");
    if (path && anchor && !targets.has(path))
      targets.set(path, {
        path,
        status: "modified",
        reviewUrl: `${changesUrl}#${encodeURIComponent(anchor)}`,
      });
    if (path.endsWith(".meta") && targets.has(path)) {
      targets.set(path, { ...targets.get(path)!, ...unityMetaGuids(githubTableLines(table)) });
    }
    if (review && !review.reviewUrl && anchor)
      review.reviewUrl = `${changesUrl}#${encodeURIComponent(anchor)}`;
    if (
      review &&
      (previous?.pending || !previous || review.rawDiff.length > previous.rawDiff.length)
    )
      files.set(review.filePath, review);
  }
  for (const target of targets.values()) {
    if (files.has(target.path) || !supportedFileKind(target.path)) continue;
    const file = cachedReview(
      header(target.path, target.previousPath ?? target.path, target.status),
      JSON.stringify(["pending", target.path]),
      cache,
    );
    if (file)
      files.set(target.path, {
        ...file,
        pending: true,
        reviewUrl: target.reviewUrl,
        diagnostics: ["GitHub has not loaded this file's text yet."],
      });
  }
  if (navigation) navigation.files = [...targets.values()];
  return {
    comparisonKey: data?.comparisonKey ?? `rendered:${changesUrl}`,
    files: [...files.values()],
    partialListing: !data,
    loadSource: data?.loadSource,
    navigation,
  };
}
