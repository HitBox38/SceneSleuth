import { createRoot } from "react-dom/client";
import App from "../popup/src/App.tsx";
import { createInlineReviews } from "../ui/contentRoot.tsx";
import { createRepositoryThemeLoader } from "../content_script/scripts/repositoryTheme.ts";
import { reviewUnityContext } from "../content_script/scripts/unityContext.ts";
import { unrealFormatSources } from "./fixtures/extended-formats.ts";
import { unityPatch } from "./fixtures/unity.ts";
import { reviewDiff } from "../content_script/scripts/diffParser.ts";
import { reviewTheme } from "../shared/reviewTheme.ts";
import type { ReviewSnapshot } from "../shared/model.ts";
import { contextBefore, contextAfter, contextReview } from "./fixtures/unity-context.ts";
import { imageReferenceReview } from "./fixtures/file-contents.ts";
import "./github-theme.css";

if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.register("./image-preview-worker.js").then(() => {
    const ready = () => (document.documentElement.dataset.imageFixture = "ready");
    if (navigator.serviceWorker.controller) ready();
    else navigator.serviceWorker.addEventListener("controllerchange", ready, { once: true });
  });
}

// Development-only synthetic repository responses and extension messaging.
const unity = reviewUnityContext(contextReview, contextBefore, contextAfter);
const godot = reviewDiff(
  'diff --git a/Player.tscn b/Player.tscn\n--- a/Player.tscn\n+++ b/Player.tscn\n@@ -1,3 +1,3 @@\n [node name="Player" type="CharacterBody3D"]\n-position = Vector3(0, 1, 2)\n+position = Vector3(1, 2, 3)\n visible = true\n',
)[0];
const unreal = reviewDiff(
  unityPatch(unrealFormatSources[0].path, unrealFormatSources[0].source),
)[0];
let environment = "unity",
  currentFile = unity;
const snapshot: ReviewSnapshot = {
  reviewKey: "theme-unity",
  title: "example/game #1",
  status: "ready",
  files: [currentFile],
  colorMode: "dark",
  navigation: {
    repositoryUrl: "https://github.com/example/game",
    changesUrl: "https://github.com/example/game/pull/1/changes",
    beforeRevision: "a".repeat(40),
    afterRevision: "b".repeat(40),
    files: [],
  },
};
const listeners = new Set<(message: unknown, sender: { tab: { id: number } }) => void>();
Object.defineProperty(window, "chrome", {
  configurable: true,
  value: {
    runtime: {
      onMessage: {
        addListener: (fn: (message: unknown, sender: { tab: { id: number } }) => void) =>
          listeners.add(fn),
        removeListener: (fn: (message: unknown, sender: { tab: { id: number } }) => void) =>
          listeners.delete(fn),
      },
    },
    tabs: {
      query: async () => [{ id: 9001, url: snapshot.navigation!.changesUrl }],
      sendMessage: async () => snapshot,
    },
  },
});
const bar = document.createElement("nav");
bar.style.cssText = "display:flex;gap:12px;align-items:center;padding:16px;flex-wrap:wrap";
function select(label: string, values: string[], onChange: (value: string) => void) {
  const wrapper = document.createElement("label");
  wrapper.textContent = label + " ";
  const input = document.createElement("select");
  input.setAttribute("aria-label", label);
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    input.append(option);
  }
  input.addEventListener("change", () => onChange(input.value));
  wrapper.append(input);
  bar.append(wrapper);
  return input;
}
const layout = document.createElement("div");
layout.style.cssText =
  "display:grid;grid-template-columns:minmax(0,1fr) 420px;gap:20px;padding:0 16px 20px";
const region = document.createElement("section");
region.setAttribute("role", "region");
region.style.cssText = "border:1px solid var(--borderColor-default);align-self:start;min-width:0";
const header = document.createElement("header");
header.setAttribute("data-diff-header-wrapper", "");
header.style.cssText = "display:flex;gap:8px;padding:10px;align-items:center;flex-wrap:wrap";
const filename = document.createElement("strong");
filename.style.marginRight = "auto";
const viewed = document.createElement("label");
const checkbox = document.createElement("input");
checkbox.type = "checkbox";
viewed.append(checkbox, " Viewed");
header.append(filename, viewed);
const table = document.createElement("table");
table.setAttribute("data-diff-anchor", "diff-theme");
const cell = table.insertRow().insertCell();
cell.style.whiteSpace = "pre-wrap";
const body = document.createElement("div");
body.append(table);
region.append(header, body);
const popup = document.createElement("div");
popup.style.cssText = "border:1px solid var(--borderColor-default);align-self:start;min-width:0";
layout.append(region, popup);
document.body.append(bar, layout);
const renderer = createInlineReviews();
let popupRoot = createRoot(popup);
popupRoot.render(<App />);
function publish() {
  snapshot.files = [
    { ...currentFile, reviewUrl: `${location.origin}${location.pathname}#diff-theme` },
  ];
  filename.textContent = currentFile.filePath;
  table.setAttribute("aria-label", `Diff for: ${currentFile.filePath}`);
  cell.textContent = currentFile.rawDiff;
  renderer.update(snapshot);
  for (const listener of listeners)
    listener({ action: "REVIEW_UPDATED", snapshot }, { tab: { id: 9001 } });
  document.documentElement.dataset.engine = reviewTheme(snapshot, currentFile);
}
const loader = createRepositoryThemeLoader({
  onTheme: (theme) => {
    snapshot.repositoryTheme = theme;
    publish();
  },
  readData: JSON.parse,
  async fetch() {
    const items = [
      ...(["unity", "mixed"].includes(environment)
        ? [
            { path: "Assets", contentType: "directory" },
            { path: "ProjectSettings", contentType: "directory" },
          ]
        : []),
      ...(["godot", "mixed"].includes(environment)
        ? [{ path: "project.godot", contentType: "file" }]
        : []),
      ...(["unreal", "mixed"].includes(environment)
        ? [{ path: "Game.uproject", contentType: "file" }]
        : []),
    ];
    return Response.json({
      payload: {
        codeViewTreeRoute: { path: "/", refInfo: { currentOid: "b".repeat(40) }, tree: { items } },
      },
    });
  },
});
const fileSelect = select(
  "File",
  ["Unity scene", "Godot scene", "Unreal project", "Graphic reference"],
  (value) => {
    currentFile =
      value === "Unity scene"
        ? unity
        : value === "Godot scene"
          ? godot
          : value === "Unreal project"
            ? unreal
            : imageReferenceReview;
    publish();
  },
);
select("Repository", ["unity", "godot", "unreal", "mixed"], (value) => {
  environment = value;
  snapshot.repositoryTheme = undefined;
  snapshot.reviewKey = `theme-${value}`;
  currentFile = value === "unreal" ? unreal : value === "godot" ? godot : unity;
  fileSelect.value =
    value === "unreal" ? "Unreal project" : value === "godot" ? "Godot scene" : "Unity scene";
  publish();
  loader.update(snapshot.reviewKey, snapshot.navigation);
});
select("GitHub appearance", ["dark", "light"], (value) => {
  document.documentElement.dataset.colorMode = value;
  snapshot.colorMode = value as "dark" | "light";
  publish();
});
const reopen = document.createElement("button");
reopen.textContent = "Reopen popup";
reopen.addEventListener("click", () => {
  popupRoot.unmount();
  popupRoot = createRoot(popup);
  popupRoot.render(<App />);
});
bar.append(reopen);
publish();
loader.update(snapshot.reviewKey, snapshot.navigation);
