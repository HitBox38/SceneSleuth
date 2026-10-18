import { extendedFormatSources, extendedFormatPatches } from "./fixtures/extended-formats.ts";
import { reviewDiff } from "../content_script/scripts/diffParser.ts";
import { reviewGithubTable, readGithubReview } from "../content_script/scripts/githubDom.ts";
import { createInlineReviews } from "../ui/contentRoot.tsx";
import type { ReviewSnapshot } from "../shared/model.ts";
import { unityMetaGuids } from "../shared/unityMeta.ts";
import "./github-theme.css";

// Development-only synthetic data. Exercise production adapters and shadow roots.
const files = extendedFormatPatches().flatMap(reviewDiff);
const bar = document.createElement("nav");
bar.style.cssText = "display:flex;gap:12px;padding:16px;flex-wrap:wrap";
const label = document.createElement("label");
label.textContent = "Review file ";
const select = document.createElement("select");
for (const file of files) {
  const option = document.createElement("option");
  option.value = file.filePath;
  option.textContent = file.filePath;
  select.append(option);
}
label.append(select);
bar.append(label);
function button(text: string, action: () => void) {
  const element = document.createElement("button");
  element.textContent = text;
  element.addEventListener("click", action);
  bar.append(element);
}
const region = document.createElement("section");
region.setAttribute("role", "region");
region.style.cssText = "margin:0 12px;border:1px solid var(--borderColor-default);min-width:0";
let header = document.createElement("header");
header.setAttribute("data-diff-header-wrapper", "");
header.style.cssText = "display:flex;gap:10px;align-items:center;padding:8px;flex-wrap:wrap";
const name = document.createElement("strong");
name.style.cssText = "margin-right:auto;overflow-wrap:anywhere;min-width:0";
const viewed = document.createElement("label");
const checkbox = document.createElement("input");
checkbox.type = "checkbox";
viewed.append(checkbox, " Viewed");
header.append(name, viewed);
const body = document.createElement("div");
const table = document.createElement("table");
body.append(table);
region.append(header, body);
document.body.append(bar, region);
const reviews = createInlineReviews();
const snapshot: ReviewSnapshot = {
  reviewKey: "extended-formats",
  title: "Synthetic file formats",
  status: "ready",
  files,
  navigation: {
    repositoryUrl: "https://github.com/example/game",
    changesUrl: `${location.origin}${location.pathname}`,
    beforeRevision: "a".repeat(40),
    afterRevision: "b".repeat(40),
    files: files.map((file, index) => ({
      path: file.filePath,
      status: file.status,
      reviewUrl: `${location.origin}${location.pathname}#diff-format-${index}`,
      ...(file.filePath.endsWith(".meta")
        ? unityMetaGuids(extendedFormatSources[index].source.map((s) => "+" + s))
        : {}),
    })),
  },
};
function showFile() {
  const index = files.findIndex((file) => file.filePath === select.value);
  const file = files[index];
  const anchor = `diff-format-${index}`;
  name.textContent = file.filePath;
  table.setAttribute("aria-label", `Diff for: ${file.filePath}`);
  table.setAttribute("data-diff-anchor", anchor);
  table.replaceChildren();
  const patchLines = [
    `@@ -0,0 +1,${extendedFormatSources[index].source.length} @@`,
    ...extendedFormatSources[index].source.map((s) => "+" + s),
  ];
  patchLines.forEach((text, rowIndex) => {
    const row = table.insertRow();
    const cell = row.insertCell();
    cell.textContent = text;
    cell.className = rowIndex ? "diff-text-cell" : "diff-hunk-cell";
    if (rowIndex) {
      cell.setAttribute("data-line-number", String(rowIndex));
      cell.setAttribute("data-diff-line-key", `b:1-l:null-r:${rowIndex}`);
      cell.id = `${anchor}R${rowIndex}`;
    }
  });
  file.reviewUrl = `${location.origin}${location.pathname}#${anchor}`;
  const parsed = reviewGithubTable(table, file);
  if (JSON.stringify(parsed?.changes) !== JSON.stringify(file.changes))
    throw new Error(`DOM extraction mismatch: ${file.filePath}`);
  const fallback = readGithubReview(document, "https://github.com/example/game/pull/1/changes");
  if (!fallback?.partialListing || fallback.files.length !== 1)
    throw new Error("DOM-only discovery mismatch");
  reviews.update(snapshot);
  document.documentElement.dataset.checkedFile = file.filePath;
}
select.addEventListener("change", showFile);
button("Reconcile", () => reviews.update(snapshot));
button("Replace header", () => {
  const clone = document.createElement("header");
  clone.setAttribute("data-diff-header-wrapper", "");
  clone.style.cssText = header.style.cssText;
  clone.append(name, viewed);
  header.replaceWith(clone);
  header = clone;
  reviews.update(snapshot);
});
button("Unsupported file", () => {
  table.setAttribute("aria-label", "Diff for: script.cs");
  reviews.update(snapshot);
});
button("Toggle theme", () => {
  document.documentElement.dataset.colorMode =
    document.documentElement.dataset.colorMode === "dark" ? "light" : "dark";
});
showFile();
