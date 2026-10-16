import { createRoot } from "react-dom/client";
import { useState } from "react";
import { Inspector } from "../ui/SceneReview.tsx";
import { reviewGithubData } from "../content_script/scripts/githubReview.ts";
import { reviewGithubTable } from "../content_script/scripts/githubDom.ts";
import type { ReviewSnapshot } from "../shared/model.ts";
import { Button } from "../popup/src/components/ui/button.tsx";
import { createInlineReviews } from "../ui/contentRoot.tsx";
import "../ui/review.css";

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
};
function makeTable(split: boolean) {
  const table = document.createElement("table");
  table.setAttribute("aria-label", `Diff for: ${path}`);
  table.setAttribute("data-diff-anchor", "diff-fixture");
  let oldLine = 1,
    newLine = 1;
  for (const text of lines) {
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
      cell.id = `diff-fixture${side === "left" ? "L" : "R"}${side === "left" ? oldLine : newLine}`;
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
let domResult =
  "DOM checks passed: unified and split rows produce identical changes and source lines.";
try {
  verifyDom(false);
  verifyDom(true);
} catch (error) {
  domResult = String(error);
}
const inlineContainer = document.createElement("div");
inlineContainer.id = "inline-fixture";
inlineContainer.style.cssText =
  "max-width:740px;margin:32px auto;color:#d1d7e0;border:1px solid #3d444d;border-radius:6px;";
const githubHeader = document.createElement("header");
githubHeader.style.cssText =
  "padding:14px;background:#252b34;display:flex;justify-content:space-between;gap:8px;";
const name = document.createElement("strong");
name.textContent = path;
const viewedLabel = document.createElement("label");
const viewed = document.createElement("input");
viewed.type = "checkbox";
viewedLabel.append(viewed, " Viewed");
githubHeader.append(name, viewedLabel);
const diffBody = document.createElement("div");
diffBody.dataset.testid = "diff-body";
diffBody.append(makeTable(false));
inlineContainer.append(githubHeader, diffBody);
const otherTable = document.createElement("table");
otherTable.setAttribute("aria-label", "Diff for: Scripts/player.gd");
otherTable.textContent = "Non-scene diff remains unchanged";
otherTable.style.display = "table";
inlineContainer.append(otherTable);
document.body.prepend(inlineContainer);
const inlineReviews = createInlineReviews();
inlineReviews.update(ready);
// A second scene arrives later; private project source is never used here.
const delayedFile = {
  ...data.files[0]!,
  filePath: "Scenes/delayed.tscn",
  reviewUrl: `${location.origin}${location.pathname}#diff-delayed`,
};
let inlineSnapshot = ready;

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
              if (!inlineContainer.querySelector('[aria-label="Diff for: Scenes/delayed.tscn"]')) {
                const table = makeTable(false);
                table.setAttribute("aria-label", "Diff for: Scenes/delayed.tscn");
                table.setAttribute("data-diff-anchor", "diff-delayed");
                inlineContainer.append(table);
              }
              inlineSnapshot = { ...ready, files: [...ready.files, delayedFile] };
              inlineReviews.update(inlineSnapshot);
            }}
          >
            Load delayed scene
          </Button>
          <Button
            className="ss-button"
            onPress={() => inlineReviews.update({ ...ready, reviewKey: "other-page", files: [] })}
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
  fixtureRoot.unmount();
  inlineReviews.dispose();
  inlineContainer.remove();
});
