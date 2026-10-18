import { extendedFormatSources } from "./fixtures/extended-formats.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewDiff } from "../content_script/scripts/diffParser.ts";
import { reviewViewLabel, supportedFileKind, isSettingsFile } from "../shared/fileTypes.ts";
import { unityStructuredValue, unityInspectorValue } from "../ui/unityPresentation.ts";
import { propertyGroups } from "../ui/propertyPresentation.ts";
import { unityPatch, imageGuid } from "./fixtures/unity.ts";

function modified(path: string, before: string[], after: string[], start = 1) {
  return reviewDiff(
    `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -${start},${before.length} +${start},${after.length} @@\n${before.map((s) => "-" + s).join("\n")}\n${after.map((s) => "+" + s).join("\n")}\n`,
  )[0];
}

test("Unity material reviews keep shader, texture, and saved properties with exact source", () => {
  const source = [
    "%YAML 1.1",
    "--- !u!21 &2100000",
    "Material:",
    "  m_Name: Water",
    "  m_Shader: {fileID: 4800000, guid: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, type: 3}",
    "  m_SavedProperties:",
    "    m_TexEnvs:",
    `    - _MainTex: {m_Texture: {fileID: 2800000, guid: ${imageGuid}, type: 3}, m_Scale: {x: 1, y: 1}}`,
    "    m_Colors:",
    "    - _Color: {r: 0.2, g: 0.4, b: 1, a: 1}",
  ];
  const file = reviewDiff(unityPatch("Assets/Water.mat", source))[0];
  assert.equal(reviewViewLabel(file), "Material");
  assert.equal(file.coverage, "complete");
  assert.deepEqual(file.diagnostics, []);
  assert.equal(file.changes[0].label, "Water");
  assert.equal(file.changes[0].kind, "unity_object");
  const saved = file.changes[0].properties.find((p) => p.name === "m_SavedProperties")!;
  assert.equal(saved.newLine, 6);
  assert.equal(saved.afterReferences![0].unityGuid, imageGuid);
  assert.equal(unityStructuredValue(saved.after!)?.kind, "dictionary");
  assert.equal(unityInspectorValue("{r: 0.2, g: 0.4, b: 1, a: 1}")?.kind, "color");
  const changed = modified(
    "Assets/Water.mat",
    ["--- !u!21 &2100000", "Material:", "  m_CustomRenderQueue: 2000"],
    ["--- !u!21 &2100000", "Material:", "  m_CustomRenderQueue: 3000"],
  );
  assert.equal(changed.changes[0].properties[0].before, "2000");
  assert.equal(changed.changes[0].properties[0].after, "3000");
  assert.equal(
    modified("Assets/Water.mat", ["    _Glossiness: 0.2"], ["    _Glossiness: 0.5"], 40).changes[0]
      .kind,
    "unknown",
  );
});

test("Unity metadata exposes root and importer settings without carrying owners across hunks", () => {
  const file = reviewDiff(
    unityPatch("Assets/Player.png.meta", [
      "fileFormatVersion: 2",
      `guid: ${imageGuid}`,
      "TextureImporter:",
      "  mipmaps:",
      "    enableMipMap: 0",
      "  spriteMode: 1",
      "  platformSettings:",
      "  - buildTarget: Standalone",
      "    maxTextureSize: 2048",
    ]),
  )[0];
  assert.equal(reviewViewLabel(file), "Import settings");
  assert.equal(file.coverage, "complete");
  assert.deepEqual(file.diagnostics, []);
  assert.deepEqual(
    file.changes.map((c) => c.label),
    ["File metadata", "TextureImporter"],
  );
  assert.equal(
    file.changes[1].properties.find((p) => p.name === "mipmaps")?.after,
    "\n    enableMipMap: 0",
  );
  const changed = modified(
    "Assets/Player.png.meta",
    ["TextureImporter:", "  maxTextureSize: 1024", "  spriteMode: 1"],
    ["TextureImporter:", "  maxTextureSize: 2048", "  spriteMode: 1"],
  );
  assert.deepEqual(
    changed.changes[0].properties.map((p) => [p.name, p.before, p.after]),
    [["maxTextureSize", "1024", "2048"]],
  );
  const partial = modified(
    "Assets/Player.png.meta",
    ["  maxTextureSize: 1024"],
    ["  maxTextureSize: 2048"],
    40,
  );
  assert.equal(partial.changes[0].kind, "unknown");
  assert.equal(partial.changes[0].properties[0].newLine, 40);
  const malicious = reviewDiff(
    unityPatch("Assets/x.meta", ["TextureImporter:", "  value: !execute danger"]),
  )[0];
  assert.equal(malicious.changes[0].properties[0].afterIncomplete, true);
  assert.equal(
    reviewDiff(unityPatch("Assets/x.meta", ["folderAsset: yes", `guid: ${imageGuid}`]))[0]
      .changes[0].properties[0].after,
    "yes",
  );
});

test("Unity controllers show states, transitions, parameters and local motion references", () => {
  const source = [
    "--- !u!91 &9100000",
    "AnimatorController:",
    "  m_Name: Locomotion",
    "  m_AnimatorParameters:",
    "  - m_Name: Speed",
    "    m_Type: 1",
    "    m_DefaultFloat: 0",
    "  m_AnimatorLayers:",
    "  - m_Name: Base Layer",
    "    m_StateMachine: {fileID: 100}",
    "--- !u!1107 &100",
    "AnimatorStateMachine:",
    "  m_Name: Movement",
    "  m_DefaultState: {fileID: 200}",
    "--- !u!1102 &200",
    "AnimatorState:",
    "  m_Name: Idle",
    "  m_Transitions:",
    "  - {fileID: 300}",
    "--- !u!1101 &300",
    "AnimatorStateTransition:",
    "  m_DstState: {fileID: 200}",
    "  m_Conditions:",
    "  - m_ConditionEvent: Speed",
    "    m_ConditionMode: 3",
    "    m_EventTreshold: 0.1",
    "  m_TransitionDuration: 0.25",
  ];
  const file = reviewDiff(unityPatch("Assets/Locomotion.controller", source))[0];
  assert.equal(reviewViewLabel(file), "Controller");
  assert.deepEqual(file.diagnostics, []);
  assert.equal(
    file.changes[1].properties.find((p) => p.name === "m_DefaultState")?.afterReferences?.[0].label,
    "Idle (AnimatorState)",
  );
  assert.ok(propertyGroups(file.changes[0]).some((g) => g.label === "Parameters"));
  assert.ok(propertyGroups(file.changes[3]).some((g) => g.label === "Conditions"));
  const changed = modified(
    "Assets/Locomotion.controller",
    ["--- !u!1101 &300", "AnimatorStateTransition:", "  m_TransitionDuration: 0.25"],
    ["--- !u!1101 &300", "AnimatorStateTransition:", "  m_TransitionDuration: 0.5"],
  );
  assert.equal(changed.changes[0].properties[0].before, "0.25");
  assert.equal(changed.changes[0].properties[0].after, "0.5");
  assert.equal(
    modified(
      "Assets/Locomotion.controller",
      ["    m_EventTreshold: 0.1"],
      ["    m_EventTreshold: 0.2"],
      80,
    ).changes[0].kind,
    "unknown",
  );
});

test("Unity override controllers retain base-controller and original/replacement clip references", () => {
  const source = [
    "--- !u!221 &22100000",
    "AnimatorOverrideController:",
    "  m_Name: Armored movement",
    `  m_Controller: {fileID: 9100000, guid: ${imageGuid}, type: 2}`,
    "  m_Clips:",
    "  - m_OriginalClip: {fileID: 7400000, guid: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, type: 2}",
    "    m_OverrideClip: {fileID: 7400000, guid: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, type: 2}",
  ];
  const file = reviewDiff(unityPatch("Assets/Armored.overrideController", source))[0];
  assert.equal(reviewViewLabel(file), "Overrides");
  assert.deepEqual(file.diagnostics, []);
  const clips = file.changes[0].properties.find((p) => p.name === "m_Clips")!;
  assert.deepEqual(
    clips.afterReferences?.map((r) => r.unityGuid),
    ["a".repeat(32), "b".repeat(32)],
  );
  assert.equal(unityStructuredValue(clips.after!)?.kind, "array");
  assert.ok(propertyGroups(file.changes[0]).some((g) => g.label === "Clip replacements"));
  const before = source.slice(0, 4);
  const after = [...before];
  after[3] = "  m_Controller: {fileID: 0}";
  const changed = modified("Assets/Armored.overrideController", before, after);
  assert.equal(changed.changes[0].properties[0].beforeReferences![0].unityGuid, imageGuid);
  assert.equal(changed.changes[0].properties[0].afterReferences![0].label, "None");
  assert.equal(
    modified(
      "Assets/Armored.overrideController",
      ["    m_OverrideClip: {fileID: 0}"],
      ["    m_OverrideClip: {fileID: 123}"],
      90,
    ).changes[0].kind,
    "unknown",
  );
});

test("Unity animation clips expose tracks, exact keys, events and looping settings", () => {
  const example = extendedFormatSources.find((f) => f.path.endsWith(".anim"))!;
  const file = reviewDiff(unityPatch(example.path, example.source))[0];
  assert.equal(reviewViewLabel(file), "Animation");
  assert.deepEqual(file.diagnostics, []);
  const tracks = file.changes[0].properties.find((p) => p.name === "m_FloatCurves")!;
  assert.match(tracks.after!, /attribute: m_LocalPosition.x/);
  assert.match(tracks.after!, /time: 1\n        value: 2/);
  assert.equal(unityStructuredValue(tracks.after!)?.kind, "array");
  assert.deepEqual(
    propertyGroups(file.changes[0]).map((g) => g.label),
    ["Properties", "Tracks and keyframes", "Clip settings", "Events"],
  );
  const changed = modified(
    example.path,
    ["--- !u!74 &7400000", "AnimationClip:", "  m_SampleRate: 30"],
    ["--- !u!74 &7400000", "AnimationClip:", "  m_SampleRate: 60"],
  );
  assert.equal(changed.changes[0].properties[0].before, "30");
  assert.equal(changed.changes[0].properties[0].after, "60");
  const partial = modified(example.path, ["        value: 2"], ["        value: 3"], 60);
  assert.equal(partial.changes[0].kind, "unknown");
  assert.equal(partial.changes[0].properties[0].afterIncomplete, true);
  assert.equal(
    reviewDiff(unityPatch(example.path, example.source, true))[0].changes[0].operation,
    "removed",
  );
});

test("Godot import settings use sections, exact values, source links and file references", () => {
  const example = extendedFormatSources.find((f) => f.path.endsWith(".import"))!;
  const file = reviewDiff(unityPatch(example.path, example.source))[0];
  assert.equal(reviewViewLabel(file), "Import settings");
  assert.equal(isSettingsFile(file), true);
  assert.deepEqual(file.diagnostics, []);
  assert.deepEqual(
    file.changes.map((c) => [c.label, c.className]),
    [
      ["remap", "ResourceImporter"],
      ["deps", "ResourceImporter"],
      ["params", "ResourceImporter"],
    ],
  );
  const source = file.changes[1].properties[0];
  assert.equal(source.afterReferences![0].resourcePath, "res://Textures/Water.png");
  assert.equal(source.newLine, 5);
  const changed = modified(
    example.path,
    ["[params]", "compress/mode=0", "mipmaps/generate=true"],
    ["[params]", "compress/mode=2", "mipmaps/generate=true"],
  );
  assert.deepEqual(
    changed.changes[0].properties.map((p) => [p.name, p.before, p.after]),
    [["compress/mode", "0", "2"]],
  );
  assert.equal(
    modified(example.path, ["compress/mode=0"], ["compress/mode=2"], 30).changes[0].kind,
    "unknown",
  );
  assert.equal(supportedFileKind("Game/.godot/imported/generated.tscn"), undefined);
  assert.equal(supportedFileKind("Game/.godot/imported/generated.import"), undefined);
});

test("Godot export presets keep platform options and identical keys in separate presets", () => {
  const example = extendedFormatSources.find((f) => f.path.endsWith("export_presets.cfg"))!;
  const file = reviewDiff(unityPatch(example.path, example.source))[0];
  assert.equal(reviewViewLabel(file), "Export");
  assert.deepEqual(file.diagnostics, []);
  assert.deepEqual(
    file.changes.map((c) => c.label),
    ["preset.0", "preset.0.options", "preset.1", "preset.1.options"],
  );
  assert.equal(file.changes[0].properties[0].after, '"Windows Desktop"');
  assert.equal(file.changes[2].properties[0].after, '"Web"');
  const changed = modified(
    example.path,
    ["[preset.0.options]", 'binary_format/architecture="x86_64"'],
    ["[preset.0.options]", 'binary_format/architecture="arm64"'],
  );
  assert.equal(changed.changes[0].properties[0].before, '"x86_64"');
  assert.equal(changed.changes[0].properties[0].after, '"arm64"');
  assert.equal(
    modified(example.path, ['name="Windows"'], ['name="Web"'], 40).changes[0].kind,
    "unknown",
  );
  assert.equal(supportedFileKind("Game/other.cfg"), undefined);
  assert.equal(supportedFileKind("Game/.godot/export_credentials.cfg"), undefined);
  assert.equal(reviewDiff(unityPatch(example.path, example.source, true))[0].coverage, "complete");
});
