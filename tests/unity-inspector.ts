import { createInlineReviews } from "../ui/contentRoot.tsx";
import { createUnityContextLoader } from "../content_script/scripts/githubUnityContext.ts";
import { createReviewState } from "../content_script/scripts/reviewState.ts";
import { contextBefore, contextAfter, contextReview } from "./fixtures/unity-context.ts";
import type { ReviewSnapshot, SceneReview } from "../shared/model.ts";
import "./github-theme.css";

const navigation = {
  repositoryUrl: "https://github.com/example/game",
  changesUrl: "https://github.com/example/game/pull/1/changes",
  beforeRevision: "a".repeat(40),
  afterRevision: "b".repeat(40),
  files: [],
};
const state = createReviewState();
const renderer = createInlineReviews();
const region = document.createElement("section");
region.setAttribute("role", "region");
region.style.cssText = "margin:20px;border:1px solid var(--borderColor-default)";
const header = document.createElement("header");
header.setAttribute("data-diff-header-wrapper", "");
header.style.cssText = "padding:12px;display:flex;align-items:center;gap:12px";
const name = document.createElement("strong");
name.textContent = contextReview.filePath;
name.style.marginRight = "auto";
const viewed = document.createElement("label");
const checkbox = document.createElement("input");
checkbox.type = "checkbox";
viewed.append(checkbox, " Viewed");
header.append(name, viewed);
const table = document.createElement("table");
table.setAttribute("aria-label", `Diff for: ${contextReview.filePath}`);
table.setAttribute("data-diff-anchor", "diff-unity-inspector");
const cell = table.insertRow().insertCell();
cell.textContent = contextReview.rawDiff;
cell.style.whiteSpace = "pre-wrap";
const body = document.createElement("div");
body.append(table);
region.append(header, body);
document.body.append(region);
const file = {
  ...contextReview,
  reviewUrl: `${location.origin}${location.pathname}#diff-unity-inspector`,
};
const data = state.merge({ comparisonKey: "unity-inspector", files: [file], navigation });
const snapshot: ReviewSnapshot = {
  reviewKey: "unity-inspector",
  title: "Unity Inspector",
  status: "ready",
  files: data.files,
  navigation,
};
renderer.update(snapshot);
const loader = createUnityContextLoader({
  onFile(file) {
    snapshot.files = state.merge({
      comparisonKey: "unity-inspector",
      files: [file],
      partialListing: true,
    }).files;
    renderer.update(snapshot);
    document.documentElement.dataset.contextStatus = file.sourceContext;
  },
  readBlob: JSON.parse,
  async fetch(input) {
    const old = String(input).includes("a".repeat(40));
    return Response.json({
      payload: {
        codeViewBlobLayoutRoute: {
          path: old ? file.previousPath : file.filePath,
          refInfo: { currentOid: old ? navigation.beforeRevision : navigation.afterRevision },
        },
        "codeViewBlobLayoutRoute.StyledBlob": { rawLines: old ? contextBefore : contextAfter },
      },
    });
  },
});
loader.update(snapshot.reviewKey, snapshot.files, navigation, new Set([file.filePath]));

// Browser verification may supply a public review in memory. It is never saved
// as a source fixture or used by the packaged extension.
export function showReview(review: SceneReview) {
  loader.clear();
  name.textContent = review.filePath;
  table.setAttribute("aria-label", `Diff for: ${review.filePath}`);
  snapshot.files = [review];
  renderer.update(snapshot);
}
