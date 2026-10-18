import assert from "node:assert/strict";
import { test } from "node:test";
import { parseScene, sourceLines } from "../content_script/scripts/contentParser.ts";
import { reviewDiff } from "../content_script/scripts/diffParser.ts";
import { reviewGithubData } from "../content_script/scripts/githubReview.ts";
import { godotFileKind, reviewViewLabel } from "../shared/fileTypes.ts";
import { inlineFileContents } from "../ui/fileContents.ts";
import { referenceLink, referenceImageSource } from "../shared/referenceLinks.ts";
import { resourcePath, resourceSource, resourceReview } from "./fixtures/resource.ts";

test("complete text resources distinguish file metadata, declarations, embedded and main resources", () => {
  const file = resourceReview;
  assert.equal(file.coverage, "complete");
  assert.deepEqual(
    file.changes.map((c) => c.kind),
    ["resource_header", "ext_resource", "sub_resource", "resource"],
  );
  assert.deepEqual(file.diagnostics, []);
  const root = file.changes.find((c) => c.kind === "resource")!;
  assert.equal(root.className, "TileSet");
  assert.equal(root.id, "resource:main");
  assert.equal(root.newLine, 7);
  assert.equal(root.properties.find((p) => p.name === "tile_size")?.after, "Vector2i(48, 48)");
  assert.equal(root.properties.find((p) => p.name === "tile_size")?.newLine, 11);
  assert.equal(
    root.properties.find((p) => p.name === "sources/0")?.afterReferences?.[0].label,
    "TileSetAtlasSource",
  );
  assert.equal(
    file.changes[2].properties.find((p) => p.name.startsWith("0:0/0"))?.after,
    "PackedVector2Array(-24, -24, 24, -24, 24, 24)",
  );
  assert.deepEqual(
    inlineFileContents(file).changes.map((c) => c.kind),
    ["resource_header", "sub_resource", "resource"],
  );
  assert.equal(reviewViewLabel(file), "Resource");
});

test("resource comparisons retain before/after values and ignore unchanged properties", () => {
  const [file] = reviewDiff(
    "diff --git a/material.tres b/material.tres\n--- a/material.tres\n+++ b/material.tres\n@@ -8,3 +8,3 @@\n [resource]\n-roughness = 0.3\n+roughness = 0.8\n metallic = 0.2\n",
  );
  assert.equal(file.coverage, "partial");
  assert.equal(file.changes.length, 1);
  assert.equal(file.changes[0].className, "");
  assert.deepEqual(
    file.changes[0].properties.map((p) => [p.name, p.before, p.after, p.oldLine, p.newLine]),
    [["roughness", "0.3", "0.8", 9, 9]],
  );
});

test("separate hunks and truncated resources never borrow an owner", () => {
  const [file] = reviewDiff(
    'diff --git a/a.tres b/a.tres\n--- a/a.tres\n+++ b/a.tres\n@@ -1,2 +1,2 @@\n [sub_resource type="Gradient" id="1"]\n-offsets=PackedFloat32Array(0, 1)\n+offsets=PackedFloat32Array(0, 0.5)\n@@ -30,1 +30,1 @@\n-size=Vector2(1, 1)\n+size=Vector2(2, 2)\n',
  );
  assert.equal(file.changes[1].kind, "unknown");
  assert.equal(file.changes[1].label, "Unresolved resource context");
  assert.equal(
    file.changes[0].properties.some((p) => p.name === "size"),
    false,
  );
  const parsed = parseScene(
    sourceLines(
      '[resource]\ncustom_data = {\n"x": 1\n[sub_resource type="Gradient" id="1"]\noffsets=PackedFloat32Array(0, 1)',
    ),
    "partial",
    { format: "resource" },
  );
  assert.equal(parsed.sections.length, 2);
  assert.match(parsed.diagnostics[0], /Incomplete value/);
  assert.equal(parsed.sections[0].properties.get("custom_data")?.raw, '{\n"x": 1');
});

test("resource texture references resolve within their nested project and selected revision", () => {
  const reference = resourceReview.changes[2].properties.find((p) => p.name === "texture")!
    .afterReferences![0];
  const navigation = {
    changesUrl: "https://github.com/example/game/pull/1/changes",
    repositoryUrl: "https://github.com/example/game",
    afterRevision: "a".repeat(40),
    files: [
      { path: "Demos/coop/project.godot", status: "modified" as const },
      {
        path: "Demos/coop/Assets/light.png",
        status: "added" as const,
        reviewUrl: "https://github.com/example/game/pull/1/changes#diff-image",
      },
    ],
  };
  assert.equal(
    referenceLink(reference, resourceReview, "after", navigation)?.href,
    navigation.files[1].reviewUrl,
  );
  assert.equal(
    referenceImageSource(reference, resourceReview, "after", navigation),
    `https://github.com/example/game/raw/${"a".repeat(40)}/Demos/coop/Assets/light.png`,
  );
});

test("deleted, renamed, lazy and binary resource files retain their supported boundaries", () => {
  const [removed] = reviewDiff(
    `diff --git a/a.tres b/a.tres\n--- a/a.tres\n+++ /dev/null\n@@ -1,${resourceSource.length} +0,0 @@\n${resourceSource.map((l) => "-" + l).join("\n")}\n`,
  );
  assert.equal(removed.coverage, "complete");
  assert.equal(removed.changes.find((c) => c.kind === "resource")?.operation, "removed");
  const [renamed] = reviewDiff(
    "diff --git a/a.tres b/b.tres\nrename from a.tres\nrename to b.tres\n",
  );
  assert.equal(renamed.previousPath, "a.tres");
  assert.equal(renamed.status, "renamed");
  assert.equal(godotFileKind("a.res"), undefined);
  const snapshot = reviewGithubData(
    {
      payload: {
        pullRequestsChangesRoute: {
          diffSummaries: [
            { path: resourcePath, changeType: "ADDED" },
            { path: "binary.res", changeType: "ADDED" },
          ],
          diffContents: [],
        },
      },
    },
    "https://github.com/example/game/pull/1/changes",
  )!;
  assert.equal(snapshot.files.length, 1);
  assert.equal(snapshot.files[0].pending, true);
  const scene = parseScene(sourceLines("[resource]\nvalue=1"));
  assert.match(scene.diagnostics[0], /Unsupported section/);
});
