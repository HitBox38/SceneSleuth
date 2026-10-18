import { createInlineReviews } from "../ui/contentRoot.tsx";
import { createGithubLoader } from "../content_script/scripts/githubLoader.ts";
import { reviewGithubData } from "../content_script/scripts/githubReview.ts";
import { createReviewState } from "../content_script/scripts/reviewState.ts";
import { readGithubReview } from "../content_script/scripts/githubDom.ts";
import type { ReviewSnapshot } from "../shared/model.ts";
import "./github-theme.css";

const url = "https://github.com/example/game/pull/1/changes";
const base = "a".repeat(40),
  head = "b".repeat(40);
const files = ["Forest", "Desert", "Ocean"].map((name) => ({
  path: `Scenes/${name}.tscn`,
  source: [
    `[node name="${name}" type="Node2D"]`,
    ...Array.from(
      { length: 30 },
      (_, i) =>
        `value_${i} = ${name === "Forest" ? 100 + i : name === "Desert" ? 200 + i : 300 + i}`,
    ),
  ],
}));
const data = reviewGithubData(
  {
    payload: {
      pullRequestsChangesRoute: {
        comparison: { fullDiff: { baseOid: base, headOid: head } },
        diffSummaries: files.map((f, i) => ({
          path: f.path,
          pathDigest: `virtual-${i}`,
          changeType: "ADDED",
          linesAdded: f.source.length,
        })),
        diffContents: [],
      },
    },
  },
  url,
)!;
const state = createReviewState();
state.merge(data);
let reviews = createInlineReviews();
const toolbar = document.createElement("nav");
toolbar.style.cssText =
  "position:sticky;top:0;padding:12px;background:var(--bgColor-default);z-index:2;display:flex;gap:12px;flex-wrap:wrap";
const status = document.createElement("output");
status.setAttribute("aria-label", "Loading status");
const anchorButton = document.createElement("button");
anchorButton.textContent = "Verify scroll anchor";
toolbar.append(status, anchorButton);
document.body.append(toolbar);
const regions = files.map((file, i) => {
  const region = document.createElement("section");
  region.setAttribute("role", "region");
  region.id = `diff-virtual-${i}`;
  region.style.cssText = "margin:12px;border:1px solid var(--borderColor-default)";
  const header = document.createElement("header");
  header.setAttribute("data-diff-header-wrapper", "");
  header.style.cssText =
    "padding:12px;display:flex;justify-content:space-between;gap:12px;align-items:center";
  const title = document.createElement("strong");
  title.textContent = file.path;
  const viewed = document.createElement("label"),
    checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  viewed.append(checkbox, " Viewed");
  header.append(title, viewed);
  const body = document.createElement("div");
  body.style.height = "1600px";
  body.dataset.virtualBody = String(i);
  region.append(header, body);
  document.body.append(region);
  return region;
});
const footer = document.createElement("div");
footer.style.height = "1800px";
footer.textContent = "End of synthetic comparison";
document.body.append(footer);
let enabled = true;
function tableFor(index: number) {
  const file = files[index],
    table = document.createElement("table");
  table.setAttribute("aria-label", `Diff for: ${file.path}`);
  table.setAttribute("data-diff-anchor", `diff-virtual-${index}`);
  [`@@ -0,0 +1,${file.source.length} @@`, ...file.source.map((s) => "+" + s)].forEach((text, i) => {
    const cell = table.insertRow().insertCell();
    cell.textContent = text;
    cell.style.cssText = "padding:20px 6px";
    cell.className = i ? "diff-text-cell" : "diff-hunk-cell";
    if (i) {
      cell.dataset.lineNumber = String(i);
      cell.dataset.diffLineKey = `b:1-l:null-r:${i}`;
      cell.id = `diff-virtual-${index}R${i}`;
    }
  });
  return table;
}
function snapshot(): ReviewSnapshot {
  const current = state.current!;
  return {
    reviewKey: "virtualized",
    title: "Synthetic virtualized PR",
    status: "ready",
    files: current.files,
    navigation: current.navigation,
    preloading: loader.remaining,
  };
}
function publish() {
  reviews.update(snapshot());
  const current = state.current!;
  const ready = current.files.filter((f) => !f.pending).length;
  status.textContent = `${ready} of ${files.length} files ready · ${document.querySelectorAll("table").length} native tables mounted`;
  document.documentElement.dataset.readyFiles = String(ready);
}
const observer = new IntersectionObserver(
  (entries) => {
    if (!enabled) return;
    for (const entry of entries) {
      const index = regions.indexOf(entry.target as HTMLElement),
        body = regions[index].lastElementChild as HTMLElement;
      if (entry.isIntersecting && !body.querySelector("table")) {
        body.style.height = "";
        body.replaceChildren(tableFor(index));
      } else if (!entry.isIntersecting && body.querySelector("table")) {
        body.style.height = `${body.getBoundingClientRect().height}px`;
        body.replaceChildren();
      }
    }
    const dom = readGithubReview(document, url);
    if (dom) state.merge(dom);
    publish();
  },
  { rootMargin: "150px" },
);
regions.forEach((r) => observer.observe(r));
const loader = createGithubLoader({
  onData: (loaded) => {
    state.merge(loaded);
    publish();
  },
  onProgress: () => {},
  fetch: async (input) => {
    // Only fixture transport is synthetic. Production loader, adapters, cache,
    // mounting, and scroll stabilization are exercised unchanged.
    const paths = new URL(String(input)).searchParams
      .get("paths")!
      .split(",")
      .map(decodeURIComponent);
    return Response.json(
      files
        .filter((f) => paths.includes(f.path))
        .map((f) => ({
          path: f.path,
          oldCommitOid: base,
          newCommitOid: head,
          diffLines: [
            { type: "HUNK", text: `@@ -0,0 +1,${f.source.length} @@` },
            ...f.source.map((s) => ({ type: "ADDITION", text: "+" + s })),
          ],
        })),
    );
  },
});
loader.update(state.current!, url);
anchorButton.addEventListener("click", () => {
  void (async () => {
    enabled = false;
    observer.disconnect();
    reviews.dispose();
    reviews = createInlineReviews();
    regions.forEach((region, i) => {
      const body = region.lastElementChild as HTMLElement;
      body.style.height = "";
      body.replaceChildren(tableFor(i));
    });
    window.scrollTo(0, regions[1].offsetTop - 150);
    const before = regions[1].getBoundingClientRect().top;
    reviews.update(snapshot());
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const delta = regions[1].getBoundingClientRect().top - before;
    document.documentElement.dataset.anchorDelta = String(delta);
    status.textContent = `Scroll anchor ${Math.abs(delta) <= 1 ? "passed" : "FAILED"}: moved ${delta}px`;
  })();
});
