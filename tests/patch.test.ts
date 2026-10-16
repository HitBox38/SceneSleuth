import test from "node:test";
import assert from "node:assert/strict";
import { reviewDiff } from "../content_script/scripts/diffParser.ts";
import { reviewContext } from "../shared/protocol.ts";
const header = "diff --git a/scene.tscn b/scene.tscn\n--- a/scene.tscn\n+++ b/scene.tscn\n";
test("context headers associate changed values with the right node and source lines", () => {
  const [file] = reviewDiff(
    header +
      '@@ -10,3 +10,3 @@\n [node name="Player" type="CharacterBody2D" parent="."]\n-position = Vector2(1, 2)\n+position = Vector2(4, 5)\n visible = true\n',
  );
  assert.equal(file.coverage, "partial");
  assert.equal(file.additions, 1);
  assert.equal(file.deletions, 1);
  assert.equal(file.changes.length, 1);
  assert.equal(file.changes[0].label, "Player");
  assert.deepEqual(
    file.changes[0].properties.map((p) => [p.name, p.oldLine, p.newLine]),
    [["position", 11, 11]],
  );
});
test("separated hunks never inherit the previous hunk's owner", () => {
  const [file] = reviewDiff(
    header +
      '@@ -1,2 +1,2 @@\n [node name="A" type="Node2D"]\n-x = 1\n+x = 2\n@@ -100 +100 @@\n-position = Vector2(1, 2)\n+position = Vector2(4, 5)\n',
  );
  assert.equal(file.changes.length, 2);
  assert.equal(file.changes[1].kind, "unknown");
  assert.equal(file.changes[1].properties[0].name, "position");
  assert.ok(file.diagnostics.some((note) => note.includes("outside the diff")));
});
test("complete new scenes and removed scenes are distinguished from existing partial files", () => {
  const [added] = reviewDiff(
    'diff --git a/new.tscn b/new.tscn\nnew file mode 100644\n--- /dev/null\n+++ b/new.tscn\n@@ -0,0 +1,3 @@\n+[gd_scene format=3]\n+[node name="Root" type="Node2D"]\n+position = Vector2(1, 2)\n',
  );
  assert.equal(added.status, "added");
  assert.equal(added.coverage, "complete");
  assert.ok(added.changes.every((change) => change.operation === "added"));
  const [removed] = reviewDiff(
    'diff --git a/old.tscn b/old.tscn\n--- a/old.tscn\n+++ /dev/null\n@@ -1 +0,0 @@\n-[node name="Root"]\n',
  );
  assert.equal(removed.status, "removed");
  assert.equal(removed.changes[0].operation, "removed");
});
test("truncated new-file patches are explicitly partial", () => {
  const [file] = reviewDiff(
    'diff --git a/new.tscn b/new.tscn\n--- /dev/null\n+++ b/new.tscn\n@@ -0,0 +1,20 @@\n+[node name="Root"]\n',
  );
  assert.equal(file.coverage, "partial");
  assert.ok(file.diagnostics.some((note) => note.includes("truncated")));
});
test("pure renames remain visible and non-scene files are excluded", () => {
  const files = reviewDiff(
    "diff --git a/old.tscn b/new.tscn\nsimilarity index 100%\nrename from old.tscn\nrename to new.tscn\ndiff --git a/a.gd b/a.gd\n--- a/a.gd\n+++ b/a.gd\n@@ -1 +1 @@\n-a\n+b\n",
  );
  assert.equal(files.length, 1);
  assert.equal(files[0].status, "renamed");
  assert.equal(files[0].previousPath, "old.tscn");
});
test("paths with spaces are retained and same sections across hunks merge once", () => {
  const patch =
    'diff --git a/My Scene.tscn b/My Scene.tscn\n--- a/My Scene.tscn\n+++ b/My Scene.tscn\n@@ -1,2 +1,2 @@\n [node name="Root"]\n-x = 1\n+x = 2\n@@ -10,2 +10,2 @@\n [node name="Root"]\n-y = 1\n+y = 3\n';
  const [file] = reviewDiff(patch);
  assert.equal(file.filePath, "My Scene.tscn");
  assert.equal(file.changes.length, 1);
  assert.equal(file.changes[0].properties.length, 2);
});
test("review contexts are scoped to a single GitHub PR and ignore URL fragments", () => {
  const a = reviewContext("https://github.com/owner/repo/pull/5/files#diff-abc");
  const b = reviewContext("https://github.com/owner/repo/pull/5");
  assert.equal(a?.key, b?.key);
  assert.equal(a?.changesUrl, "https://github.com/owner/repo/pull/5/files");
  assert.equal(a?.isChangesPage, true);
  assert.equal(b?.isChangesPage, false);
  assert.notEqual(a?.key, reviewContext("https://github.com/owner/repo/pull/6")?.key);
  assert.equal(reviewContext("https://example.com/owner/repo/pull/5"), undefined);
});

test("explicitly identical sections relocated between hunks compare before and after once", () => {
  const [file] = reviewDiff(
    header +
      '@@ -1,2 +0,0 @@\n-[node name="Root" type="Node2D"]\n-x = 1\n@@ -20,0 +19,2 @@\n+[node name="Root" type="Node2D"]\n+x = 2\n',
  );
  assert.equal(file.changes.length, 1);
  assert.equal(file.changes[0].operation, "modified");
  assert.deepEqual(
    file.changes[0].properties.map((p) => [p.name, p.before, p.after]),
    [["x", "1", "2"]],
  );
});

test("source links preserve selected commit ranges and query parameters", () => {
  const context = reviewContext(
    "https://github.com/owner/repo/pull/5/changes/earlier?w=1#diff-file",
  );
  assert.equal(context?.key, "/owner/repo/pull/5");
  assert.equal(context?.changesUrl, "https://github.com/owner/repo/pull/5/changes/earlier?w=1");
  assert.equal(context?.isChangesPage, true);
});
