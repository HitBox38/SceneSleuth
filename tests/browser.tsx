import { createRoot } from "react-dom/client";
import { useState } from "react";
import { Inspector } from "../ui/SceneReview.tsx";
import { reviewGithubData } from "../content_script/scripts/githubReview.ts";
import {
  observeGithubDiffs,
  readGithubReview,
  reviewGithubTable,
} from "../content_script/scripts/githubDom.ts";
import type { ReviewSnapshot } from "../shared/model.ts";
import { Button } from "../popup/src/components/ui/button.tsx";
import { createInlineReviews } from "../ui/contentRoot.tsx";
import {
  referencedScenePath,
  referencedSceneSource,
  referencedSceneReview,
  changedReferenceLines,
  changedReferenceReview,
  imageReferenceLines,
  imageReferenceReview,
} from "./fixtures/file-contents.ts";
import "../ui/review.css";

// Mock only this fixture's synthetic image URLs, including requests from the
// shadow-root review. No extension code registers a service worker or mocks data.
if ("serviceWorker" in navigator) {
  void navigator.serviceWorker
    .register("./image-preview-worker.js")
    .then(() => {
      const ready = () => (document.documentElement.dataset.imageFixture = "ready");
      if (navigator.serviceWorker.controller) ready();
      else navigator.serviceWorker.addEventListener("controllerchange", ready, { once: true });
    })
    .catch(() => {
      document.documentElement.dataset.imageFixture = "unavailable";
    });
}

// Synthetic source only. This page is a development fixture, never a runtime fallback.
const path = "Scenes/forest/player.tscn";
const lines = [
  "@@ -1,5 +1,8 @@",
  " [gd_scene format=3]",
  ' [node name="Player" type="CharacterBody2D"]',
  "-position = Vector2(10, 20)",
  "+position = Vector2(30, 40)",
  " visible = true",
  '+[node name="Vision" type="Area2D" parent="."]',
  "+collision_layer = 8",
  '+description = "<img src=x onerror=alert(1)>"',
  " ",
];
const data = reviewGithubData(
  {
    payload: {
      pullRequestsChangesRoute: {
        comparison: { fullDiff: { baseOid: "before", headOid: "after" } },
        diffSummaries: [
          { path, changeType: "MODIFIED", pathDigest: "fixture", linesAdded: 4, linesDeleted: 1 },
        ],
        diffContents: [
          {
            path,
            diffLines: lines.map((text) => ({
              type: text.startsWith("@@")
                ? "HUNK"
                : text.startsWith("+")
                  ? "ADDITION"
                  : text.startsWith("-")
                    ? "DELETION"
                    : "CONTEXT",
              text,
            })),
          },
        ],
      },
    },
  },
  `${location.origin}${location.pathname}`,
)!;
const ready: ReviewSnapshot = {
  reviewKey: "fixture",
  title: "Synthetic game #12",
  status: "ready",
  files: data.files,
  navigation: {
    changesUrl: `${location.origin}${location.pathname}${location.search}`,
    repositoryUrl: "https://github.com/example/game",
    beforeRevision: "a".repeat(40),
    afterRevision: "b".repeat(40),
    files: [
      {
        path: "Scripts/light_controller.gd",
        status: "modified",
        reviewUrl: `${location.origin}${location.pathname}${location.search}#diff-reference-script`,
      },
    ],
  },
};
function makeTable(split: boolean, sourceLines = lines, filePath = path, anchor = "diff-fixture") {
  const table = document.createElement("table");
  table.setAttribute("aria-label", `Diff for: ${filePath}`);
  table.setAttribute("data-diff-anchor", anchor);
  let oldLine = 1,
    newLine = 1;
  for (const text of sourceLines) {
    const row = document.createElement("tr");
    table.append(row);
    if (text.startsWith("@@")) {
      const cell = document.createElement("td");
      cell.className = "diff-hunk-cell";
      cell.textContent = text;
      row.append(cell);
      continue;
    }
    const operation = text[0];
    const append = (side: string) => {
      const cell = document.createElement("td");
      cell.className = "diff-text-cell";
      cell.setAttribute("data-line-number", String(side === "left" ? oldLine : newLine));
      cell.setAttribute("data-diff-line-key", `b:1-l:${oldLine}-r:${newLine}`);
      cell.id = `${anchor}${side === "left" ? "L" : "R"}${side === "left" ? oldLine : newLine}`;
      cell.textContent = operation === " " ? text.slice(1) : text;
      row.append(cell);
    };
    append(operation === "-" ? "left" : "right");
    if (split && operation === " ") append("left");
    if (operation !== "+") oldLine++;
    if (operation !== "-") newLine++;
  }
  return table;
}
function verifyDom(split: boolean) {
  const result = reviewGithubTable(makeTable(split), data.files[0]);
  if (
    JSON.stringify(result?.changes) !== JSON.stringify(data.files[0].changes) ||
    result?.additions !== 4 ||
    result?.deletions !== 1 ||
    JSON.stringify(result?.diagnostics) !== JSON.stringify(data.files[0].diagnostics)
  )
    throw new Error(`${split ? "Split" : "Unified"} DOM comparison failed`);
}
function verifyRouteFallback() {
  const doc = document.implementation.createHTMLDocument("Route fixture");
  const app = doc.createElement("react-app");
  // A previous PR's valid payload must not leak into the new PR's review.
  app.setAttribute("initial-path", "/example/game/pull/99/changes");
  const script = doc.createElement("script");
  script.setAttribute("data-target", "react-app.embeddedData");
  script.textContent = JSON.stringify({
    payload: {
      pullRequestsChangesRoute: {
        diffSummaries: [{ path: "wrong-pr.tscn", changeType: "ADDED", linesAdded: 20 }],
      },
    },
  });
  app.append(script);
  doc.body.append(app, makeTable(false));
  const item = doc.createElement("li");
  item.setAttribute("role", "treeitem");
  item.id = "Scripts/current.gd";
  const link = doc.createElement("a");
  link.href = "#diff-current-script";
  item.append(link);
  const folder = doc.createElement("li");
  folder.id = "Scripts";
  folder.setAttribute("role", "treeitem");
  folder.append(item);
  doc.body.append(folder);
  const review = readGithubReview(doc, "https://github.com/example/game/pull/12/changes");
  if (
    !review?.partialListing ||
    review.files.length !== 1 ||
    review.navigation?.files.find((file) => file.path === "Scripts/current.gd")?.reviewUrl !==
      "https://github.com/example/game/pull/12/changes#diff-current-script" ||
    review.navigation?.files.some((file) => file.path === "wrong-pr.tscn") ||
    review.navigation?.files.some((file) => file.path === "Scripts") ||
    review.navigation?.afterRevision !== undefined ||
    review.files[0]?.filePath !== path ||
    JSON.stringify(review.files[0]?.changes) !== JSON.stringify(data.files[0]?.changes) ||
    review.files[0]?.reviewUrl !== "https://github.com/example/game/pull/12/changes#diff-fixture" ||
    review.files[0]?.coverage !== "partial"
  )
    throw new Error("Stale embedded route fallback failed");
  doc.querySelector("table")!.remove();
  const other = doc.createElement("table");
  other.setAttribute("aria-label", "Diff for: game.gd");
  doc.body.append(other);
  const empty = readGithubReview(doc, "https://github.com/example/game/pull/12/changes");
  if (!empty?.partialListing || empty.files.length)
    throw new Error("DOM-only listing must remain incomplete");
}
function verifyNullableLineKeys() {
  for (const removed of [false, true]) {
    const operation = removed ? "-" : "+";
    const table = makeTable(false, [
      removed ? "@@ -1,2 +0,0 @@" : "@@ -0,0 +1,2 @@",
      `${operation}[node name="Lamp" type="PointLight2D"]`,
      `${operation}energy = 1`,
    ]);
    for (const cell of table.querySelectorAll("[data-diff-line-key]"))
      cell.setAttribute(
        "data-diff-line-key",
        cell
          .getAttribute("data-diff-line-key")!
          .replace(removed ? /r:\d+/ : /l:\d+/, removed ? "r:null" : "l:null"),
      );
    const file = reviewGithubTable(table);
    const energy = file?.changes[0]?.properties.find((property) => property.name === "energy");
    if (
      file?.changes.length !== 1 ||
      file.changes[0]?.label !== "Lamp" ||
      file.changes[0]?.operation !== (removed ? "removed" : "added") ||
      energy?.before !== (removed ? "1" : undefined) ||
      energy?.after !== (removed ? undefined : "1") ||
      file.additions !== (removed ? 0 : 2) ||
      file.deletions !== (removed ? 2 : 0)
    )
      throw new Error("Nullable GitHub source-line identities lost scene values");
  }
}
let domResult =
  "DOM checks passed: unified and split rows produce identical changes and source lines.";
try {
  verifyDom(false);
  verifyDom(true);
  verifyRouteFallback();
  verifyNullableLineKeys();
} catch (error) {
  domResult = String(error);
}
const inlineContainer = document.createElement("div");
inlineContainer.id = "inline-fixture";
inlineContainer.style.cssText =
  "max-width:740px;margin:32px auto;color:#d1d7e0;border:1px solid #3d444d;border-radius:6px;";
function makeHeader(filePath: string) {
  const header = document.createElement("header");
  header.setAttribute("data-diff-header-wrapper", "");
  header.style.cssText =
    "padding:10px;background:#252b34;display:flex;align-items:center;justify-content:space-between;gap:8px;font:12px system-ui;";
  const title = document.createElement("strong");
  title.textContent = filePath;
  title.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;";
  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;align-items:center;gap:6px;flex-shrink:0;";
  const copilot = document.createElement("button");
  copilot.textContent = "◉";
  copilot.setAttribute("aria-label", "Ask about this diff");
  copilot.setAttribute("data-testid", "copilot-diff-explain-button");
  copilot.style.cssText =
    "background:transparent;color:#d1d7e0;border:1px solid #3d444d;border-radius:5px;padding:5px;";
  const label = document.createElement("label");
  label.style.cssText = "display:flex;align-items:center;white-space:nowrap;gap:3px;";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  label.append(checkbox, "Viewed");
  actions.append(copilot, label);
  header.append(title, actions);
  return header;
}
let githubHeader = makeHeader(path);
let name = githubHeader.querySelector("strong")!;
const diffBody = document.createElement("div");
diffBody.dataset.testid = "diff-body";
diffBody.append(makeTable(false));
const primaryRegion = document.createElement("section");
primaryRegion.setAttribute("role", "region");
primaryRegion.setAttribute("aria-label", "GitHub file fixture");
primaryRegion.append(githubHeader, diffBody);
inlineContainer.append(primaryRegion);
const otherTable = document.createElement("table");
otherTable.setAttribute("aria-label", "Diff for: Scripts/player.gd");
otherTable.textContent = "Non-scene diff remains unchanged";
otherTable.style.display = "table";
inlineContainer.append(otherTable);
const nativeTree = document.createElement("ul");
nativeTree.setAttribute("role", "tree");
nativeTree.setAttribute("aria-label", "File Tree");
const nativeItem = document.createElement("li");
nativeItem.setAttribute("role", "treeitem");
nativeItem.id = "Scripts/light_controller.gd";
const nativeFileLink = document.createElement("a");
nativeFileLink.href = "#diff-reference-script";
nativeFileLink.textContent = "Scripts/light_controller.gd (lazy diff)";
nativeFileLink.addEventListener("click", () => {
  nativeFileLink.dataset.visits = String(Number(nativeFileLink.dataset.visits ?? 0) + 1);
  if (!document.getElementById("diff-reference-script")) {
    const target = document.createElement("section");
    target.id = "diff-reference-script";
    target.setAttribute("aria-label", "Referenced script diff");
    target.textContent = "Scripts/light_controller.gd · native GitHub diff loaded";
    inlineContainer.append(target);
  }
});
nativeItem.append(nativeFileLink);
nativeTree.append(nativeItem);
inlineContainer.append(nativeTree);
document.body.prepend(inlineContainer);
const inlineReviews = createInlineReviews();
inlineReviews.update(ready);
// A second scene arrives later; private project source is never used here.
const delayedLines = [
  "@@ -1,2 +1,2 @@",
  ' [node name="Lantern" type="PointLight2D"]',
  "-energy = 0.5",
  "+energy = 0.75",
];
function makeDelayedTable() {
  return makeTable(false, delayedLines, "Scenes/delayed.tscn", "diff-delayed");
}
const delayedFile = reviewGithubTable(makeDelayedTable())!;
delayedFile.reviewUrl = `${location.origin}${location.pathname}#diff-delayed`;
let inlineSnapshot = ready;
let pendingInlineUpdate: ReturnType<typeof setTimeout> | undefined;
let inlineUpdateCount = 0;
const inlineObserver = observeGithubDiffs(inlineContainer, () => {
  if (pendingInlineUpdate !== undefined) return;
  pendingInlineUpdate = setTimeout(() => {
    pendingInlineUpdate = undefined;
    inlineContainer.dataset.observerUpdates = String(++inlineUpdateCount);
    inlineReviews.update(inlineSnapshot);
  }, 10);
});

function Fixture() {
  const [snapshot, setSnapshot] = useState(ready);
  return (
    <div style={{ maxWidth: 740, margin: "32px auto" }}>
      <aside className="ss" style={{ padding: 20, marginBottom: 16, borderRadius: 12 }}>
        <h1 style={{ fontSize: 18 }}>SceneSleuth development fixture</h1>
        <p style={{ margin: "8px 0" }}>Synthetic data · {domResult}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Button className="ss-button" onPress={() => inlineReviews.open()}>
            Go to inline review
          </Button>
          <Button
            className="ss-button"
            onPress={() => {
              for (let i = 0; i < 20; i++) inlineReviews.update(inlineSnapshot);
            }}
          >
            Repeat inline processing
          </Button>
          <Button
            className="ss-button"
            onPress={() => {
              const nextHeader = makeHeader(name.textContent ?? path);
              githubHeader.replaceWith(nextHeader);
              githubHeader = nextHeader;
              name = githubHeader.querySelector("strong")!;
            }}
          >
            Remount GitHub header
          </Button>
          <Button
            className="ss-button"
            onPress={() => {
              diffBody.querySelector("table")?.remove();
              diffBody.append(makeTable(true));
              inlineReviews.update(inlineSnapshot);
            }}
          >
            Remount GitHub table
          </Button>
          <Button
            className="ss-button"
            onPress={() => {
              diffBody.querySelector("table")?.remove();
              diffBody.append(
                makeTable(
                  false,
                  [
                    `@@ -0,0 +1,${referencedSceneSource.length} @@`,
                    ...referencedSceneSource.map((line) => `+${line}`),
                  ],
                  referencedScenePath,
                  "diff-references",
                ),
              );
              name.textContent = referencedScenePath;
              inlineSnapshot = { ...ready, files: [referencedSceneReview] };
              inlineReviews.update(inlineSnapshot);
            }}
          >
            Scene with file references
          </Button>
          <Button
            className="ss-button"
            onPress={() => {
              diffBody.querySelector("table")?.remove();
              diffBody.append(
                makeTable(false, changedReferenceLines, referencedScenePath, "diff-references"),
              );
              name.textContent = referencedScenePath;
              inlineSnapshot = { ...ready, files: [changedReferenceReview] };
              inlineReviews.update(inlineSnapshot);
            }}
          >
            Changed file references
          </Button>
          <Button
            className="ss-button"
            onPress={() => {
              diffBody.querySelector("table")?.remove();
              diffBody.append(
                makeTable(false, imageReferenceLines, referencedScenePath, "diff-references"),
              );
              name.textContent = referencedScenePath;
              inlineSnapshot = { ...ready, files: [imageReferenceReview] };
              inlineReviews.update(inlineSnapshot);
            }}
          >
            Image preview states
          </Button>
          <Button
            className="ss-button"
            onPress={() => {
              const table = diffBody.querySelector("table")!;
              table.setAttribute("aria-label", "Diff for: Scripts/player.gd");
              name.firstChild!.nodeValue = "Scripts/player.gd";
            }}
          >
            Reuse table for script
          </Button>
          <Button
            className="ss-button"
            onPress={() => {
              const table = diffBody.querySelector("table")!;
              const next = makeDelayedTable();
              table.replaceChildren(...next.childNodes);
              table.setAttribute("aria-label", next.getAttribute("aria-label")!);
              table.setAttribute("data-diff-anchor", "diff-delayed");
              name.firstChild!.nodeValue = delayedFile.filePath;
              inlineSnapshot = { ...ready, files: [...ready.files, delayedFile] };
            }}
          >
            Reuse table for another scene
          </Button>
          <Button
            className="ss-button"
            onPress={() => {
              if (!inlineContainer.querySelector('[aria-label="Diff for: Scenes/delayed.tscn"]')) {
                const region = document.createElement("section");
                region.setAttribute("role", "region");
                region.setAttribute("aria-label", "Delayed GitHub file fixture");
                region.append(makeHeader(delayedFile.filePath), makeDelayedTable());
                inlineContainer.append(region);
              }
              inlineSnapshot = { ...ready, files: [...ready.files, delayedFile] };
              inlineReviews.update(inlineSnapshot);
            }}
          >
            Load delayed scene
          </Button>
          <Button
            className="ss-button"
            onPress={() => {
              inlineSnapshot = { ...ready, reviewKey: "other-page", files: [] };
              inlineReviews.update(inlineSnapshot);
            }}
          >
            Leave review
          </Button>
          <Button
            className="ss-button"
            onPress={() => {
              inlineSnapshot = ready;
              inlineReviews.update(ready);
            }}
          >
            Restore inline review
          </Button>
          <Button className="ss-button" onPress={() => setSnapshot(ready)}>
            Ready
          </Button>
          <Button
            className="ss-button"
            onPress={() => setSnapshot({ ...ready, status: "loading", files: [] })}
          >
            Loading
          </Button>
          <Button className="ss-button" onPress={() => setSnapshot({ ...ready, files: [] })}>
            Empty
          </Button>
          <Button
            className="ss-button"
            onPress={() =>
              setSnapshot({
                ...ready,
                status: "error",
                files: [],
                error: "GitHub data is unavailable. Refresh to retry.",
              })
            }
          >
            Error
          </Button>
        </div>
      </aside>
      <Inspector snapshot={snapshot} onRefresh={() => setSnapshot(ready)} />
    </div>
  );
}
const fixtureRoot = createRoot(document.getElementById("root")!);
fixtureRoot.render(<Fixture />);
import.meta.hot?.dispose(() => {
  inlineObserver.disconnect();
  clearTimeout(pendingInlineUpdate);
  fixtureRoot.unmount();
  inlineReviews.dispose();
  inlineContainer.remove();
});
