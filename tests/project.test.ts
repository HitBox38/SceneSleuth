import test from "node:test";
import assert from "node:assert/strict";
import { reviewDiff } from "../content_script/scripts/diffParser.ts";
import { parseScene, sourceLines } from "../content_script/scripts/contentParser.ts";
import { reviewGithubData } from "../content_script/scripts/githubReview.ts";
import { referenceLink } from "../shared/referenceLinks.ts";

const header =
  "diff --git a/Demos/coop/project.godot b/Demos/coop/project.godot\n--- a/Demos/coop/project.godot\n+++ b/Demos/coop/project.godot\n";
test("complete project configurations retain global settings, sections, multiline objects, and quoted keys", () => {
  const source = [
    "; Engine configuration",
    "config_version=5",
    "[application]",
    'config/name="Coop; [demo]"',
    'config/description="First line\nSecond line with = and ;"',
    "[input]",
    '"move=left"={',
    '"deadzone": 0.2,',
    '"events": [Object(InputEventKey,"physical_keycode":65)]',
    "}",
    "[rendering]",
    'renderer/rendering_method="gl_compatibility"',
  ].join("\n");
  const lines = source.split("\n");
  const [file] = reviewDiff(
    `diff --git a/Demos/coop/project.godot b/Demos/coop/project.godot\n--- /dev/null\n+++ b/Demos/coop/project.godot\n@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}`).join("\n")}\n`,
  );
  assert.equal(file.coverage, "complete");
  assert.deepEqual(file.diagnostics, []);
  assert.deepEqual(
    file.changes.map((change) => [change.kind, change.label]),
    [
      ["project", "File settings"],
      ["project", "application"],
      ["project", "input"],
      ["project", "rendering"],
    ],
  );
  assert.equal(file.changes[0].properties[0].name, "config_version");
  assert.equal(
    file.changes[1].properties.find((p) => p.name === "config/description")?.after,
    '"First line\nSecond line with = and ;"',
  );
  assert.equal(file.changes[2].properties[0].name, "move=left");
  assert.ok(
    file.changes[2].properties[0].after?.includes('Object(InputEventKey,"physical_keycode":65)'),
  );
});

test("project comparison keeps identical keys in different sections separate and ignores unchanged settings", () => {
  const [file] = reviewDiff(
    header +
      "@@ -8,6 +8,6 @@\n [display]\n-size=Vector2i(640, 360)\n+size=Vector2i(1280, 720)\n mode=1\n [rendering]\n-size=1\n+size=2\n mode=1\n",
  );
  assert.equal(file.coverage, "partial");
  assert.deepEqual(
    file.changes.map((change) => [
      change.label,
      change.properties.map((p) => [p.name, p.before, p.after, p.oldLine, p.newLine]),
    ]),
    [
      ["display", [["size", "Vector2i(640, 360)", "Vector2i(1280, 720)", 9, 9]]],
      ["rendering", [["size", "1", "2", 12, 12]]],
    ],
  );
});

test("partial settings hunks never infer missing section ownership or global context", () => {
  const [file] = reviewDiff(
    header +
      '@@ -10,2 +10,2 @@\n [application]\n-config/name="Before"\n+config/name="After"\n@@ -60 +60 @@\n-size=1\n+size=2\n',
  );
  assert.equal(file.changes[0].label, "application");
  assert.equal(file.changes[1].kind, "unknown");
  assert.equal(file.changes[1].label, "Unresolved settings context");
  assert.equal(file.changes[1].properties[0].after, "2");
  assert.ok(file.diagnostics.some((note) => note.includes("settings sections are outside")));
  const [global] = reviewDiff(header + "@@ -9 +9 @@\n-config_version=4\n+config_version=5\n");
  assert.equal(global.changes[0].kind, "unknown");
});

test("truncated settings values stop before the next section and keep raw text", () => {
  const parsed = parseScene(
    sourceLines('[input]\njump={\n"events": [\n[rendering]\nmode=1'),
    "project",
    { format: "project", startsAtFileBeginning: true },
  );
  assert.ok(parsed.diagnostics.some((note) => note.includes("Incomplete value")));
  assert.equal(parsed.sections[0].properties.get("jump")?.raw, '{\n"events": [');
  assert.equal(parsed.sections[1].label, "rendering");
  assert.equal(parsed.sections[1].properties.get("mode")?.raw, "1");
  const escaped = parseScene(sourceLines("[custom\\]section]\nvalue=1"), "project", {
    format: "project",
  });
  assert.equal(escaped.sections[0].label, "custom]section");
  assert.deepEqual(escaped.diagnostics, []);
  const nested = parseScene(sourceLines('[custom]\nlist=[\n["value"]\n]\nnext=1'), "project", {
    format: "project",
  });
  assert.equal(nested.sections.length, 1);
  assert.equal(nested.sections[0].properties.get("list")?.raw, '[\n["value"]\n]');
  assert.equal(nested.sections[0].properties.get("next")?.raw, "1");
  assert.deepEqual(nested.diagnostics, []);
});

test("project file references retain singleton markers, side targets, and unresolved UIDs", () => {
  const [file] = reviewDiff(
    header +
      '@@ -1,6 +1,6 @@\n [application]\n-run/main_scene="res://old.tscn"\n+run/main_scene="res://new.tscn"\n config/icon="uid://unknown"\n [autoload]\n-Game="*res://Old.gd"\n+Game="*res://New.gd"\n text="not a file"\n',
  );
  const scene = file.changes[0].properties[0];
  assert.equal(scene.beforeReferences?.[0].resourcePath, "res://old.tscn");
  assert.equal(scene.afterReferences?.[0].resourcePath, "res://new.tscn");
  const singleton = file.changes[1].properties[0];
  assert.equal(singleton.afterReferences?.[0].label, "*New.gd");
  const nav = {
    changesUrl: "https://github.com/example/game/pull/1/changes",
    repositoryUrl: "https://github.com/example/game",
    files: [
      { path: file.filePath, status: "modified" as const },
      {
        path: "Demos/coop/new.tscn",
        status: "added" as const,
        reviewUrl: "https://github.com/example/game/pull/1/changes#diff-new",
      },
    ],
  };
  assert.equal(
    referenceLink(scene.afterReferences![0], file, "after", nav)?.href,
    nav.files[1].reviewUrl,
  );
  const uid = parseScene(sourceLines('[application]\nconfig/icon="uid://unknown"'), "project", {
    format: "project",
  });
  assert.equal(uid.sections[0].properties.get("config/icon")?.raw, '"uid://unknown"');
  const [unresolved] = reviewDiff(
    header +
      '@@ -1,3 +1,3 @@\n [application]\n-config/icon="res://icon.png"\n+config/icon="uid://unknown"\n-config/name="Old"\n+config/name="res://file" + process.exit()\n',
  );
  assert.equal(unresolved.changes[0].properties[0].afterReferences, undefined);
  assert.equal(unresolved.changes[0].properties[1].afterReferences, undefined);
  assert.equal(unresolved.changes[0].properties[1].after, '"res://file" + process.exit()');
});

test("GitHub discovers lazy projects and mixed Godot files while leaving scripts and tres files alone", () => {
  const route = {
    diffSummaries: [
      { path: "scene.tscn", changeType: "ADDED", linesAdded: 2 },
      { path: "project.godot", changeType: "MODIFIED", linesAdded: 1 },
      { path: "material.tres", changeType: "MODIFIED" },
      { path: "script.gd", changeType: "MODIFIED" },
    ],
    diffContents: [
      {
        path: "project.godot",
        diffLines: [
          { type: "HUNK", text: "@@ -10,2 +10,2 @@" },
          { type: "CONTEXT", text: "[application]" },
          { type: "DELETION", text: '-config/name="A"' },
          { type: "ADDITION", text: '+config/name="B"' },
        ],
      },
    ],
  };
  const read = () =>
    reviewGithubData(
      { payload: { pullRequestsChangesRoute: route } },
      "https://github.com/example/game/pull/1/changes",
    )!;
  assert.deepEqual(
    read().files.map((file) => file.filePath),
    ["scene.tscn", "project.godot"],
  );
  assert.equal(read().files[1].changes[0].properties[0].before, '"A"');
  assert.equal(read().files[1].changes[0].properties[0].after, '"B"');
  route.diffContents = [];
  assert.equal(read().files[1].pending, true);
});

test("deleted and renamed project files retain coverage and identity", () => {
  const [removed] = reviewDiff(
    'diff --git a/project.godot b/project.godot\n--- a/project.godot\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-[application]\n-config/name="Old"\n',
  );
  assert.equal(removed.coverage, "complete");
  assert.equal(removed.changes[0].operation, "removed");
  const [renamed] = reviewDiff(
    "diff --git a/project.godot b/demo/project.godot\nrename from project.godot\nrename to demo/project.godot\n",
  );
  assert.equal(renamed.status, "renamed");
  assert.equal(renamed.previousPath, "project.godot");
});
