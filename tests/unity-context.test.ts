import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewUnityContext } from "../content_script/scripts/unityContext.ts";
import {
  createUnityContextLoader,
  unityBlobLines,
  unityBlobUrl,
} from "../content_script/scripts/githubUnityContext.ts";
import { createReviewState } from "../content_script/scripts/reviewState.ts";
import { unityStructuredValue } from "../ui/unityPresentation.ts";
import { contextBefore, contextAfter, contextReview } from "./fixtures/unity-context.ts";

const oldRevision = "a".repeat(40),
  newRevision = "b".repeat(40);
const navigation = {
  repositoryUrl: "https://github.com/example/game",
  changesUrl: "https://github.com/example/game/pull/1/changes",
  beforeRevision: oldRevision,
  afterRevision: newRevision,
  files: [],
};
function blob(path: string, revision: string, lines: string[]) {
  return {
    payload: {
      codeViewBlobLayoutRoute: { path, refInfo: { currentOid: revision } },
      "codeViewBlobLayoutRoute.StyledBlob": { rawLines: lines },
    },
  };
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("exact full source recovers nested InputAction ownership without adding unchanged properties", () => {
  assert.equal(contextReview.changes[0].kind, "unknown");
  const result = reviewUnityContext(contextReview, contextBefore, contextAfter);
  assert.equal(result.coverage, "partial");
  assert.equal(result.sourceContext, "loaded");
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].label, "Camera");
  assert.equal(result.changes[0].className, "CameraInput");
  assert.equal(result.changes[0].path, "Rig/Camera");
  assert.deepEqual(
    result.changes[0].properties.map((p) => p.name),
    ["m_TrackingStateInput"],
  );
  const p = result.changes[0].properties[0];
  assert.match(p.before!, /m_SingletonActionBindings: \[\]/);
  assert.match(p.after!, /<XRHMD>\/trackingState/);
  assert.equal(p.beforeIncomplete, undefined);
  assert.equal(
    p.oldLine,
    contextBefore.findIndex((line) => line.includes("m_SingletonActionBindings")) + 1,
  );
  assert.equal(p.newLine, p.oldLine);
  assert.equal(result.rawDiff, contextReview.rawDiff);
  assert.throws(
    () => reviewUnityContext(contextReview, contextBefore, contextBefore),
    /does not match/,
  );
});

test("InputAction Inspector trees show named bindings, preserving IDs and unknown fields in source", () => {
  const p = reviewUnityContext(contextReview, contextBefore, contextAfter).changes[0].properties[0];
  const tree = unityStructuredValue(p.after!)!;
  assert.equal(tree.label, "Tracking State Input");
  assert.equal(tree.entries!.find((entry) => entry.label === "Action Type")!.value.label, "Value");
  const bindings = tree.entries!.find((entry) => entry.label === "Bindings")!.value;
  assert.deepEqual(
    bindings.entries!.map((entry) => entry.value.label),
    ["<XRHMD>/trackingState", "<HandheldARInputDevice>/trackingState"],
  );
  assert.ok(!tree.entries!.some((entry) => entry.label === "Id"));
  assert.match(p.after!, /action-id/);
  assert.equal(
    unityStructuredValue(p.after!.replace("m_ExpectedControlType:", "futureField:"))!.kind,
    "dictionary",
  );
  const flags = unityStructuredValue(p.after!.replaceAll("m_Flags: 0", "m_Flags: 1"))!;
  assert.ok(flags.entries!.some((entry) => entry.label === "Flags"));
  const reference = unityStructuredValue(
    p.after!.replace("m_UseReference: 0", "m_UseReference: 1"),
  )!;
  assert.equal(reference.label, "Input Action Reference");
});

test("known package scripts use verified identities and duplicate owners cannot become context", () => {
  const withScript = (lines: string[]) =>
    lines.map((line) =>
      line.includes("m_EditorClassIdentifier")
        ? "  m_Script: {fileID: 11500000, guid: c2fadf230d1919748a9aa21d40f74619, type: 3}"
        : line,
    );
  assert.equal(
    reviewUnityContext(contextReview, withScript(contextBefore), withScript(contextAfter))
      .changes[0].className,
    "TrackedPoseDriver",
  );
  const duplicate = (lines: string[]) => [...lines, "  m_GameObject: {fileID: 999}"];
  assert.throws(
    () => reviewUnityContext(contextReview, duplicate(contextBefore), duplicate(contextAfter)),
    /ambiguous/,
  );
});

test("blob context requires the requested path and exact commit, complete text, and safe URLs", () => {
  assert.deepEqual(
    unityBlobLines(
      blob(contextReview.filePath, newRevision, contextAfter),
      contextReview.filePath,
      newRevision,
    ),
    contextAfter,
  );
  assert.throws(() =>
    unityBlobLines(
      blob("other.unity", newRevision, contextAfter),
      contextReview.filePath,
      newRevision,
    ),
  );
  assert.throws(() =>
    unityBlobLines(
      blob(contextReview.filePath, oldRevision, contextAfter),
      contextReview.filePath,
      newRevision,
    ),
  );
  assert.throws(() =>
    unityBlobLines(
      {
        payload: {
          path: contextReview.filePath,
          refInfo: { currentOid: newRevision },
          blob: { rawLines: contextAfter, isTruncated: true },
        },
      },
      contextReview.filePath,
      newRevision,
    ),
  );
  assert.throws(() => unityBlobUrl(navigation.repositoryUrl, "HEAD", contextReview.filePath));
  assert.throws(() =>
    unityBlobUrl("https://evil.example/x/y", newRevision, contextReview.filePath),
  );
  assert.throws(() => unityBlobUrl(navigation.repositoryUrl, newRevision, "../private.unity"));
  assert.match(
    unityBlobUrl(navigation.repositoryUrl, newRevision, "Assets/Space #%.unity"),
    /Space%20%23%25.unity$/,
  );
});

test("context loader reads two renamed revisions once, preserves enriched state, and clears on navigation", async () => {
  const results: (typeof contextReview)[] = [];
  const requests: string[] = [];
  const loader = createUnityContextLoader({
    onFile: (f) => results.push(f),
    readBlob: JSON.parse,
    fetch: async (input) => {
      const url = String(input);
      requests.push(url);
      const old = url.includes(oldRevision);
      return Response.json(
        blob(
          old ? contextReview.previousPath! : contextReview.filePath,
          old ? oldRevision : newRevision,
          old ? contextBefore : contextAfter,
        ),
      );
    },
  });
  const mounted = new Set([contextReview.filePath]);
  loader.update("one", [contextReview], navigation, new Set());
  await tick();
  assert.equal(requests.length, 0);
  loader.update("one", [contextReview], navigation, mounted);
  await tick();
  assert.equal(requests.length, 2);
  assert.equal(results.at(-1)!.sourceContext, "loaded");
  assert.ok(requests[0].endsWith("/Assets/Old.unity"));
  loader.update("one", [contextReview], navigation, mounted);
  await tick();
  assert.equal(requests.length, 2);
  const state = createReviewState();
  state.merge({ comparisonKey: "one", files: [results.at(-1)!] });
  assert.equal(
    state.merge({ comparisonKey: "one", files: [contextReview] }).files[0].sourceContext,
    "loaded",
  );
  loader.clear();
  loader.update("two", [contextReview], navigation, mounted);
  await tick();
  assert.equal(requests.length, 4);
  loader.clear();
});

test("context failures keep the diff fallback and late requests cannot update another route", async () => {
  const results: (typeof contextReview)[] = [];
  const pending: ((r: Response) => void)[] = [];
  const loader = createUnityContextLoader({
    onFile: (f) => results.push(f),
    readBlob: JSON.parse,
    fetch: () => new Promise((resolve) => pending.push(resolve)),
  });
  const mounted = new Set([contextReview.filePath]);
  loader.update("one", [contextReview], navigation, mounted);
  assert.equal(results[0].sourceContext, "loading");
  loader.clear();
  pending.forEach((resolve) => resolve(new Response("failed", { status: 403 })));
  await tick();
  assert.equal(results.length, 1);
  loader.update("two", [contextReview], navigation, mounted);
  pending.slice(2).forEach((resolve) => resolve(new Response("failed", { status: 403 })));
  await tick();
  assert.equal(results.at(-1)!.sourceContext, "unavailable");
  assert.equal(results.at(-1)!.changes, contextReview.changes);
  loader.clear();
});
