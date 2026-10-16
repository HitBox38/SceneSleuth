import test from "node:test";
import assert from "node:assert/strict";
import {
  compareSections,
  parseScene,
  sourceLines,
} from "../content_script/scripts/contentParser.ts";
import { reviewDiff } from "../content_script/scripts/diffParser.ts";
import { sceneReferenceResolver } from "../content_script/scripts/sceneReferences.ts";

const parse = (source: string) => parseScene(sourceLines(source)).sections;
const added = (source: string, path = "scene.tscn") =>
  reviewDiff(
    `diff --git a/${path} b/${path}\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${source.split("\n").length} @@\n${source
      .split("\n")
      .map((line) => `+${line}`)
      .join("\n")}\n`,
  )[0];
const header = "diff --git a/scene.tscn b/scene.tscn\n--- a/scene.tscn\n+++ b/scene.tscn\n";

test("unchanged declarations resolve changed values, without losing raw text or source lines", () => {
  const [file] = reviewDiff(
    header +
      '@@ -1,4 +1,4 @@\n [ext_resource type="PackedScene" path="res://Scenes/lamp.tscn" id="1"]\n [ext_resource type="PackedScene" path="res://Scenes/torch.tscn" id="2"]\n [node name="Root"]\n-instance = ExtResource("1")\n+instance = ExtResource("2")\n',
  );
  assert.equal(file.changes.length, 1);
  const property = file.changes[0].properties[0];
  assert.equal(property.beforeReferences?.[0].label, "lamp.tscn");
  assert.equal(property.afterReferences?.[0].label, "torch.tscn");
  assert.equal(property.before, 'ExtResource("1")');
  assert.equal(property.after, 'ExtResource("2")');
  assert.equal(property.oldLine, 4);
  assert.equal(property.newLine, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(property)), property);
});

test("the same ID resolves independently on each side, including nested array references", () => {
  const before =
    '[ext_resource type="Texture2D" path="res://old.png" id="1"]\n[node name="Root"]\ntextures = Array[Texture2D]([ExtResource("1"), null])';
  const after = before.replace("old.png", "new.png").replace(", null", ', ExtResource("1")');
  const property = compareSections(parse(before), parse(after), true).find(
    (section) => section.kind === "node",
  )!.properties[0];
  assert.deepEqual(
    property.beforeReferences?.map((ref) => ref.label),
    ["old.png"],
  );
  assert.deepEqual(
    property.afterReferences?.map((ref) => ref.label),
    ["new.png", "new.png"],
  );
  for (const ref of property.afterReferences!)
    assert.equal(property.after?.slice(ref.start, ref.end), 'ExtResource("1")');
});

test("external and embedded resource IDs have separate namespaces and embedded resources use their names", () => {
  const file = added(
    '[ext_resource type="Script" path="res://lamp.gd" id="1"]\n[sub_resource type="ShaderMaterial" id="1"]\nresource_name = "Warm <glow>"\n[sub_resource type="CircleShape2D" id="2"]\n[node name="Root"]\nscript = ExtResource("1")\nmaterial = SubResource("1")\nshape = SubResource("2")',
  );
  const properties = file.changes.find((section) => section.kind === "node")!.properties;
  assert.deepEqual(
    properties.filter((p) => !p.name.startsWith("@")).map((p) => p.afterReferences?.[0].label),
    ["lamp.gd", "Warm <glow>", "CircleShape2D"],
  );
  assert.equal(
    properties.find((p) => p.name === "material")?.afterReferences?.[0].target,
    "Embedded resource 1",
  );
});

test("reference-looking string contents, comments, malformed calls, and unfamiliar expressions stay raw", () => {
  const resolver = sceneReferenceResolver(
    parse('[ext_resource type="Script" path="res://lamp.gd" id="1"]'),
  );
  const value =
    '["ExtResource(\\\"1\\\")", ExtResource ( "1" ), MyExtResource("1"), object.ExtResource("1"), ExtResource("1", 2)] ; ExtResource("1")';
  const references = resolver(value);
  assert.equal(references.length, 1);
  assert.equal(value.slice(references[0].start, references[0].end), 'ExtResource ( "1" )');
  const dictionary = '{"literal": "ExtResource(\\\"1\\\")", "target": ExtResource("1")}';
  assert.equal(resolver(dictionary).length, 1);
  assert.equal(resolver(dictionary)[0].label, "lamp.gd");
  assert.deepEqual(resolver('"escaped \\\" ExtResource(\\\"1\\\")"'), []);
  assert.deepEqual(resolver('ExtResource("unknown")'), []);
  assert.deepEqual(resolver("ExtResource(1)"), []);
});

test("relative node paths resolve by full identity, preserving property suffixes", () => {
  const sections = parse(
    '[node name="Root" type="Node2D"]\n[node name="Left" parent="."]\n[node name="Sprite" type="Sprite2D" parent="Left"]\n[node name="Right" parent="."]\n[node name="Sprite" type="Sprite2D" parent="Right"]',
  );
  const resolver = sceneReferenceResolver(sections);
  const owner = sections.find((section) => section.path === "Left/Sprite")!;
  assert.equal(resolver('NodePath(".")', owner)[0].label, "Left/Sprite");
  assert.equal(resolver('NodePath("..")', owner)[0].label, "Left");
  assert.equal(resolver('NodePath("../..")', owner)[0].label, "Root");
  assert.equal(
    resolver('NodePath("../../Right/Sprite:position:x")', owner)[0].label,
    "Right/Sprite:position:x",
  );
  assert.equal(resolver('NodePath(":position")', owner)[0].label, "Left/Sprite:position");
  for (const path of ["", "../../../Outside", "Missing", "/root/Root", "%Sprite"])
    assert.deepEqual(resolver(`NodePath(${JSON.stringify(path)})`, owner), []);
  assert.deepEqual(resolver('NodePath("Left")'), []);
  const resource = parse('[sub_resource type="Animation" id="anim"]')[0];
  assert.deepEqual(resolver('NodePath("Left")', resource), []);
});

test("partial hunks never borrow missing declarations from another side or another file", () => {
  const [file] = reviewDiff(
    header +
      '@@ -1,3 +1,2 @@\n-[ext_resource type="Script" path="res://old.gd" id="1"]\n [node name="Root"]\n-value = [ExtResource("1"), 0]\n+value = [ExtResource("1"), 1]\n',
  );
  const property = file.changes.find((section) => section.kind === "node")!.properties[0];
  assert.equal(property.beforeReferences?.[0].label, "old.gd");
  assert.equal(property.afterReferences, undefined);
  const other = added('[node name="Root"]\nscript = ExtResource("1")', "other.tscn");
  assert.equal(
    other.changes[0].properties.find((p) => p.name === "script")?.afterReferences,
    undefined,
  );
});

test("declarations in separate available hunks resolve resources without guessing node ownership", () => {
  const [file] = reviewDiff(
    header +
      '@@ -1 +1 @@\n [ext_resource type="Script" path="res://lamp.gd" id="1"]\n@@ -50 +50 @@\n-script = null\n+script = ExtResource("1")\n',
  );
  assert.equal(file.changes[0].kind, "unknown");
  assert.equal(file.changes[0].properties[0].afterReferences?.[0].label, "lamp.gd");
});

test("duplicate asset basenames display their paths to distinguish the targets", () => {
  const file = added(
    '[ext_resource type="PackedScene" path="res://Left/lamp.tscn" id="1"]\n[ext_resource type="PackedScene" path="res://Right/lamp.tscn" id="2"]\n[node name="Root"]\nscenes = [ExtResource("1"), ExtResource("2")]',
  );
  const property = file.changes
    .find((section) => section.kind === "node")!
    .properties.find((p) => p.name === "scenes")!;
  assert.deepEqual(
    property.afterReferences?.map((ref) => ref.label),
    ["res://Left/lamp.tscn", "res://Right/lamp.tscn"],
  );
});
