import type { SceneReview } from "../../shared/model.ts";
import { reviewDiff } from "./diffParser.ts";
import { header, reviewGithubData } from "./githubReview.ts";

// Modern GitHub renders additional files on demand. Read those tables without
// clicking controls, changing review preferences, or requesting private API tokens.
export function reviewGithubTable(table: Element, previous?: SceneReview): SceneReview | undefined {
  const path = table.getAttribute("aria-label")?.replace(/^Diff for: /, "");
  if (!path?.endsWith(".tscn")) return;
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
      const match = key.match(/^b:\d+-l:(\d+)-r:(\d+)$/);
      if (!match) continue;
      const text = cell.textContent ?? "";
      const operation = text.startsWith("+") ? "+" : text.startsWith("-") ? "-" : " ";
      const id = `${operation}:${cell.getAttribute("data-line-number")}`;
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
  const script = document.querySelector('script[data-target="react-app.embeddedData"]');
  if (script?.textContent) {
    if (script.textContent.length > 8_000_000)
      throw new Error(
        "This GitHub review exceeds the current 8 MB page-data limit. Use GitHub's file filters to narrow the review, then refresh SceneSleuth.",
      );
    try {
      data = reviewGithubData(JSON.parse(script.textContent), changesUrl);
    } catch {
      /* A loading page may not yet have a complete data payload. */
    }
  }
  if (!data) return;
  const files = new Map(data.files.map((file) => [file.filePath, file]));
  for (const table of document.querySelectorAll('table[aria-label^="Diff for: "]')) {
    const path = table.getAttribute("aria-label")?.slice(10) ?? "";
    const previous = files.get(path);
    // Page tables can be virtualized. Prefer the embedded patch unless the table
    // contains more source lines (for example after expanding context).
    const review = reviewGithubTable(table, previous);
    if (
      review &&
      (previous?.pending || !previous || review.rawDiff.length > previous.rawDiff.length)
    )
      files.set(review.filePath, review);
  }
  return { comparisonKey: data.comparisonKey, files: [...files.values()] };
}
