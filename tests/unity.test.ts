import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewDiff } from "../content_script/scripts/diffParser.ts";
import { reviewGithubData } from "../content_script/scripts/githubReview.ts";
import { unityYaml } from "../shared/unityYaml.ts";
import { unityMetaGuids } from "../shared/unityMeta.ts";
import {
  referenceFilePath,
  referenceLink,
  referenceImageSource,
} from "../shared/referenceLinks.ts";
import { reviewViewLabel, reviewEngines } from "../shared/fileTypes.ts";
import { unityInspectorValue, unityStructuredValue } from "../ui/unityPresentation.ts";
import { propertyLabel, propertyGroups } from "../ui/propertyPresentation.ts";
import {
  unityPath,
  unitySource,
  unityReview,
  prefabReview,
  assetReview,
  unityPatch,
  scriptGuid,
  imageGuid,
} from "./fixtures/unity.ts";

test("complete Unity scenes retain exact object identities, ownership, references, and source lines", () => {
  const file = unityReview;
  assert.equal(file.coverage, "complete");
  assert.deepEqual(file.diagnostics, []);
  assert.deepEqual(
    file.changes.map((c) => c.kind),
    ["gameobject", "component", "component", "component"],
  );
  assert.equal(file.changes[0].id, "unity:9223372036854775801");
  assert.equal(file.changes[1].label, "Player");
  const owner = file.changes[1].properties.find((p) => p.name === "m_GameObject")!;
  assert.equal(owner.afterReferences![0].label, "Player (GameObject)");
  assert.equal(owner.newLine, 13);
  assert.equal(
    file.changes[1].properties.find((p) => p.name === "m_Father")?.afterReferences![0].label,
    "None",
  );
  assert.equal(
    file.changes[0].properties.find((p) => p.name === "m_Component")?.afterReferences?.length,
    3,
  );
  assert.equal(
    file.changes[2].properties.find((p) => p.name === "m_Script")?.afterReferences![0].unityGuid,
    scriptGuid,
  );
});

test("Unity partial comparisons retain meaningful before/after changes without unchanged deletions", () => {
  const patch =
    "diff --git a/a.unity b/a.unity\n--- a/a.unity\n+++ b/a.unity\n@@ -10,5 +10,5 @@\n --- !u!4 &200\n Transform:\n   m_GameObject: {fileID: 100}\n-  m_LocalPosition: {x: 1, y: 2, z: 3}\n+  m_LocalPosition: {x: 4, y: 2, z: 3}\n   m_LocalScale: {x: 1, y: 1, z: 1}\n";
  const file = reviewDiff(patch)[0];
  assert.equal(file.changes.length, 1);
  assert.deepEqual(
    file.changes[0].properties.map((p) => [p.name, p.before, p.after, p.oldLine, p.newLine]),
    [["m_LocalPosition", "{x: 1, y: 2, z: 3}", "{x: 4, y: 2, z: 3}", 13, 13]],
  );
  assert.equal(file.coverage, "partial");
});

test("Unity hunks never inherit an object or nested property owner", () => {
  const file = reviewDiff(
    "diff --git a/a.prefab b/a.prefab\n--- a/a.prefab\n+++ b/a.prefab\n@@ -1,3 +1,3 @@\n --- !u!1 &100\n GameObject:\n-  m_Name: A\n+  m_Name: B\n@@ -30,1 +30,1 @@\n-    x: 1\n+    x: 2\n",
  )[0];
  assert.equal(file.changes[1].kind, "unknown");
  assert.equal(file.changes[1].properties[0].name, "Diff text");
  assert.equal(file.changes[1].properties[0].after, "    x: 2");
  assert.equal(
    file.changes[0].properties.some((p) => p.name === "x"),
    false,
  );
  const truncated = reviewDiff(
    "diff --git a/a.asset b/a.asset\n--- a/a.asset\n+++ b/a.asset\n@@ -1,4 +1,4 @@\n --- !u!114 &1\n MonoBehaviour:\n   values:\n-  - 1\n+  - 2\n",
  )[0];
  assert.equal(truncated.changes[0].properties[0].afterIncomplete, true);
  assert.match(truncated.diagnostics.join(" "), /incomplete/);
});

test("prefab overrides and stripped objects remain explicit without expanding an unseen prefab", () => {
  assert.deepEqual(prefabReview.diagnostics, []);
  assert.equal(prefabReview.changes[0].className, "PrefabInstance");
  const modification = prefabReview.changes[0].properties.find((p) => p.name === "m_Modification")!;
  assert.ok(modification.after?.includes("propertyPath: m_LocalPosition.x"));
  assert.equal(unityStructuredValue(modification.after!)?.kind, "dictionary");
  assert.ok(
    prefabReview.changes[1].properties.some((p) => p.name === "@stripped" && p.after === "true"),
  );
  assert.equal(prefabReview.changes[1].label, "Transform");
});

test("text assets are Unity objects, and YAML values preserve trees, numeric components, and literal text", () => {
  assert.equal(assetReview.changes[0].kind, "unity_object");
  assert.equal(assetReview.changes[0].label, "Enemy Stats");
  assert.equal(reviewViewLabel(assetReview), "Asset");
  assert.equal(
    unityStructuredValue(assetReview.changes[0].properties.find((p) => p.name === "loot")!.after!)
      ?.kind,
    "array",
  );
  assert.deepEqual(
    unityInspectorValue("{x: 1e-3, y: -2, z: 0}")?.components.map((c) => c.value),
    ["1e-3", "-2", "0"],
  );
  assert.equal(unityInspectorValue("{r: 2, g: 0, b: 0, a: 1}"), undefined);
  assert.equal(propertyLabel("m_LocalPosition", true), "Local Position");
  assert.equal(
    propertyGroups({
      ...unityReview.changes[1],
      properties: [{ name: "m_LocalScale", operation: "modified" }],
    })[0].label,
    "Transform",
  );
  for (const raw of [
    "&loop [*loop]",
    '!execute "value"',
    "{x: 1, x: 2}",
    "[1,2",
    "x".repeat(131073),
  ])
    assert.equal(unityYaml(raw), undefined);
  assert.ok(unityYaml('"<img src=x onerror=alert(1)>"'));
});

test("GUID mappings are side-specific, unique, revision-aware, and never use unrelated local file IDs", () => {
  const reference = unityReview.changes[3].properties.find((p) => p.name === "m_Sprite")!
    .afterReferences![0];
  const nav = {
    repositoryUrl: "https://github.com/example/game",
    changesUrl: "https://github.com/example/game/pull/2/changes",
    beforeRevision: "a".repeat(40),
    afterRevision: "b".repeat(40),
    files: [
      {
        path: "Assets/light.png.meta",
        previousPath: "Assets/old.png.meta",
        status: "renamed" as const,
        unityGuidBefore: imageGuid,
        unityGuidAfter: imageGuid,
      },
      {
        path: "Assets/light.png",
        status: "renamed" as const,
        previousPath: "Assets/old.png",
        reviewUrl: "https://github.com/example/game/pull/2/changes#diff-image",
      },
    ],
  };
  assert.equal(referenceFilePath(reference, unityReview, "before", nav), "Assets/old.png");
  assert.equal(referenceLink(reference, unityReview, "after", nav)?.inReview, true);
  assert.equal(
    referenceImageSource(reference, unityReview, "before", nav),
    `https://github.com/example/game/raw/${"a".repeat(40)}/Assets/old.png`,
  );
  assert.equal(
    referenceFilePath(reference, unityReview, "after", {
      ...nav,
      files: [...nav.files, { ...nav.files[0], path: "Assets/conflict.png.meta" }],
    }),
    undefined,
  );
  assert.equal(referenceLink(reference, unityReview, "after", { ...nav, files: [] }), undefined);
  assert.deepEqual(unityMetaGuids(["+folderAsset: yes", `+guid: ${scriptGuid}`]), {
    unityGuidAfter: null,
  });
  assert.deepEqual(unityMetaGuids([`-guid: ${scriptGuid}`, `+guid: ${imageGuid}`]), {
    unityGuidBefore: scriptGuid,
    unityGuidAfter: imageGuid,
  });
});

test("GitHub discovers Unity scenes, prefabs and assets and reads metadata as an independent review", () => {
  const snapshot = reviewGithubData(
    {
      payload: {
        pullRequestsChangesRoute: {
          diffSummaries: [
            { path: unityPath, changeType: "ADDED" },
            { path: "a.prefab", changeType: "MODIFIED" },
            { path: "b.asset", changeType: "MODIFIED" },
            { path: "Assets/Player.cs.meta", changeType: "ADDED" },
            { path: "Player.cs", changeType: "MODIFIED" },
          ],
          diffContents: [
            {
              path: "Assets/Player.cs.meta",
              diffLines: [{ type: "ADDITION", text: `+guid: ${scriptGuid}` }],
            },
          ],
        },
      },
    },
    "https://github.com/example/game/pull/2/changes",
  )!;
  assert.equal(snapshot.files.length, 4);
  assert.equal(
    snapshot.files.filter((f) => !f.filePath.endsWith(".meta")).every((f) => f.pending),
    true,
  );
  assert.equal(
    snapshot.navigation?.files.find((f) => f.path.endsWith(".meta"))?.unityGuidAfter,
    scriptGuid,
  );
  assert.equal(reviewEngines([unityReview, assetReview]), "Unity");
  const removed = reviewDiff(unityPatch(unityPath, unitySource, true))[0];
  assert.equal(removed.coverage, "complete");
  assert.equal(removed.changes[0].operation, "removed");
  const renamed = reviewDiff(
    "diff --git a/a.prefab b/b.prefab\nrename from a.prefab\nrename to b.prefab\n",
  )[0];
  assert.equal(renamed.previousPath, "a.prefab");
});

test("comparison-scoped parse caches reuse identical patches and invalidate changed text and routes", () => {
  const cache: import("../content_script/scripts/githubReview.ts").GithubParseCache = {
    files: new Map(),
  };
  const route = {
    comparison: { headOid: "a" },
    diffSummaries: [{ path: "a.prefab", changeType: "ADDED", linesAdded: 3 }],
    diffContents: [
      {
        path: "a.prefab",
        diffLines: [
          { type: "HUNK", text: "@@ -0,0 +1,3 @@" },
          { type: "ADDITION", text: "+--- !u!1 &1" },
          { type: "ADDITION", text: "+GameObject:" },
          { type: "ADDITION", text: "+  m_Name: A" },
        ],
      },
    ],
  };
  const read = (url = "https://github.com/example/game/pull/2/changes") =>
    reviewGithubData({ payload: { pullRequestsChangesRoute: route } }, url, cache)!;
  const first = read();
  const cached = [...cache.files.values()][0];
  first.files[0].diagnostics.push("caller note");
  assert.equal(read().files[0].changes, first.files[0].changes);
  assert.deepEqual(read().files[0].diagnostics, []);
  assert.equal([...cache.files.values()][0], cached);
  route.diffContents[0].diffLines[3].text = "+  m_Name: B";
  assert.equal(read().files[0].changes[0].label, "B");
  assert.notEqual([...cache.files.values()][0], cached);
  const previous = [...cache.files.values()][0];
  read("https://github.com/example/game/pull/3/changes");
  assert.notEqual([...cache.files.values()][0], previous);
  read();
  const beforeComparisonChange = [...cache.files.values()][0];
  route.comparison.headOid = "b";
  read();
  assert.notEqual([...cache.files.values()][0], beforeComparisonChange);
  assert.equal(cache.files.size, 1);
});
