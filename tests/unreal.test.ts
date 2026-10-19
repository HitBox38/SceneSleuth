import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseUnreal,
  parseUnrealConfig,
  parseUnrealDescriptor,
} from "../content_script/scripts/unrealParser.ts";
import { compareSections } from "../content_script/scripts/contentParser.ts";
import type { SourceLine } from "../shared/model.ts";
import { reviewDiff } from "../content_script/scripts/diffParser.ts";
import {
  supportedFileKind,
  reviewEngine,
  reviewEngines,
  reviewViewLabel,
  isSettingsFile,
} from "../shared/fileTypes.ts";
import { repositoryTheme, reviewTheme } from "../shared/reviewTheme.ts";
import { repositoryTreeTheme } from "../content_script/scripts/repositoryTheme.ts";
import { isReviewSnapshot } from "../shared/protocol.ts";
import { iconThemeRequest } from "../shared/iconProtocol.ts";
import { actionIconTitle } from "../shared/sceneEye.ts";
import { unityPatch } from "./fixtures/unity.ts";
import { structuredValue } from "../ui/structuredValues.ts";
import { propertyCommentTarget, reviewCommentTarget } from "../shared/reviewComments.ts";

const lines = (text: string, start = 1, changed = true): SourceLine[] =>
  text.split("\n").map((text, index) => ({ text, line: start + index, changed }));
const project = `{
  "FileVersion": 3,
  "EngineAssociation": "5.4",
  "Description": "Synthetic project",
  "LargeId": 9223372036854775807,
  "Modules": [
    {"Name": "Game", "Type": "Runtime", "LoadingPhase": "Default"}
  ],
  "Plugins": [{"Name": "EnhancedInput", "Enabled": true}]
}`;

test("Unreal descriptors preserve exact JSON fields, nested values and source lines", () => {
  const parsed = parseUnrealDescriptor(lines(project), "hunk-0", "unreal_project", true);
  assert.deepEqual(parsed.diagnostics, []);
  const section = parsed.sections[0];
  assert.equal(section.kind, "project");
  assert.equal(section.className, "UnrealProject");
  assert.equal(section.properties.get("EngineAssociation")?.raw, '"5.4"');
  assert.equal(section.properties.get("LargeId")?.raw, "9223372036854775807");
  assert.match(section.properties.get("Modules")!.raw, /LoadingPhase/);
  assert.equal(section.properties.get("Modules")?.line, 6);
  const before = parseUnrealDescriptor(
    lines(project.replace('"5.4"', '"4.27"')),
    "hunk-0",
    "unreal_project",
    true,
  );
  const changes = compareSections(before.sections, parsed.sections, true);
  assert.equal(changes.length, 1);
  assert.deepEqual(
    changes[0].properties.map((property) => [
      property.name,
      property.before,
      property.after,
      property.oldLine,
      property.newLine,
    ]),
    [["EngineAssociation", '"4.27"', '"5.4"', 3, 3]],
  );
});

test("plugin JSON, escaped keys, BOM and value-on-next-line locations remain exact", () => {
  const parsed = parseUnreal(
    lines(
      '\ufeff{\n  "FriendlyName": "Tools",\n  "Modules":\n  [{"Name":"ToolsEditor","Type":"Editor"}],\n  "A\\\"B":true\n}',
    ),
    "hunk-0",
    "unreal_plugin",
    true,
  );
  assert.equal(parsed.sections[0].className, "UnrealPlugin");
  assert.equal(parsed.sections[0].properties.get("Modules")?.line, 3);
  assert.match(parsed.sections[0].properties.get("Modules")!.raw, /^\n/);
  assert.equal(parsed.sections[0].properties.get('A"B')?.raw, "true");
  assert.deepEqual(parsed.diagnostics, []);
});

test("descriptor fragments do not assign nested or missing-root fields to the project", () => {
  for (const [source, start] of [
    ['    "Enabled": false', 30],
    ['{\n "Plugins": [', 1],
    [' "EngineAssociation": "5.4"', 1],
  ] as const) {
    const parsed = parseUnrealDescriptor(
      lines(source, start),
      "hunk-2",
      "unreal_project",
      start === 1,
    );
    assert.equal(parsed.sections[0].kind, "unknown");
    assert.equal(parsed.sections[0].properties.has("Enabled"), false);
    assert.equal(parsed.sections[0].properties.get("Source")?.raw, source);
    assert.equal(parsed.sections[0].properties.get("Source")?.line, start);
    assert.equal(parsed.sections[0].properties.get("Source")?.incomplete, true);
    assert.ok(parsed.diagnostics.length);
  }
});

test("ambiguous, invalid and excessively nested descriptor JSON retains a source fallback", () => {
  for (const source of [
    '{"Name":1,"Name":2}',
    '{"Modules":[{"Name":1,"Name":2}]}',
    '{"Name":1,}',
    '{//comment\n"Name":1}',
    '{"Name":undefined}',
    '{"Name":01}',
    '{\u00a0"Name":1}',
    '{"Value":' + "[".repeat(40) + "0" + "]".repeat(40) + "}",
  ]) {
    const parsed = parseUnrealDescriptor(lines(source), "hunk-0", "unreal_plugin", true);
    assert.equal(parsed.sections[0].kind, "unknown", source);
  }
  const malicious = parseUnrealDescriptor(
    lines('{"__proto__":{"polluted":true},"Constructor":"<script>"}'),
    "hunk-0",
    "unreal_plugin",
    true,
  );
  assert.equal(malicious.sections[0].properties.get("__proto__")?.raw, '{"polluted":true}');
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, "polluted"), false);
});

function modified(path: string, before: string, after: string, start = 1) {
  return reviewDiff(
    `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -${start},${before.split("\n").length} +${start},${after.split("\n").length} @@\n${before
      .split("\n")
      .map((s) => "-" + s)
      .join("\n")}\n${after
      .split("\n")
      .map((s) => "+" + s)
      .join("\n")}\n`,
  )[0];
}

test("Unreal discovery stays within descriptors and source Config INIs", () => {
  for (const [path, kind, label] of [
    ["Game/Game.uproject", "unreal_project", "Project"],
    ["Plugins/Tools/Tools.uplugin", "unreal_plugin", "Plugin"],
    ["Config/DefaultEngine.ini", "unreal_config", "Settings"],
    ["Plugins/Tools/Config/DefaultTools.ini", "unreal_config", "Settings"],
    ["Game/Config/Windows/WindowsEngine.INI", "unreal_config", "Settings"],
  ]) {
    assert.equal(supportedFileKind(path), kind);
    assert.equal(reviewViewLabel({ filePath: path }), label);
    assert.equal(reviewEngine({ filePath: path }), "unreal");
    assert.equal(isSettingsFile({ filePath: path }), true);
  }
  for (const path of [
    "DefaultEngine.ini",
    "Other/settings.ini",
    "Content/Player.uasset",
    "Content/Map.umap",
    "Actors.t3d",
    "Object.copy",
    "Game/Saved/Config/Windows/Engine.ini",
    "Game/Intermediate/Config/Engine.ini",
    "Binaries/Plugin.uplugin",
    "DerivedDataCache/Config/Engine.ini",
    "Game/.godot/Config/Engine.ini",
  ])
    assert.equal(supportedFileKind(path), undefined, path);
});

test("descriptor comparisons expose only changed fields and never invent Godot references", () => {
  const file = modified("Game.uproject", project.replace('"5.4"', '"4.27"'), project);
  assert.equal(file.coverage, "partial");
  assert.deepEqual(
    file.changes[0].properties.map((p) => p.name),
    ["EngineAssociation"],
  );
  const added = reviewDiff(
    unityPatch("Tools.uplugin", [
      '{"Modules":[{"Name":"Tools","Type":"Editor"}],"Description":"res://unrelated.tscn"}',
    ]),
  )[0];
  assert.equal(added.coverage, "complete");
  assert.equal(added.changes[0].className, "UnrealPlugin");
  assert.ok(added.changes[0].properties.every((p) => !p.afterReferences?.length));
  const modules = added.changes[0].properties.find((p) => p.name === "Modules")!;
  assert.equal(structuredValue(modules.after!)?.kind, "array");
});

test("partial descriptor pairs preserve both sides as source instead of false field deletions", () => {
  const file = modified("Game.uproject", '{"FileVersion":3}', '{"FileVersion":3,');
  assert.equal(file.changes.length, 1);
  assert.equal(file.changes[0].kind, "unknown");
  assert.deepEqual(
    file.changes[0].properties.map((p) => p.name),
    ["Source"],
  );
  assert.equal(file.changes[0].properties[0].operation, "modified");
  assert.equal(file.changes[0].properties[0].beforeIncomplete, true);
  const nested = modified("Game.uproject", '   "Enabled":true', '   "Enabled":false', 25);
  assert.equal(nested.changes[0].kind, "unknown");
  assert.equal(nested.changes[0].properties[0].oldLine, 25);
  assert.ok(nested.diagnostics.length);
});

test("INI patch comparisons preserve ordered operations, line ranges and missing-section uncertainty", () => {
  const before =
    '[/Script/Engine.InputSettings]\n!Bindings=ClearArray\n+Bindings=(Name="Jump",Key=SpaceBar)\n.Bindings=(Name="Jump",Key=SpaceBar)';
  const after = before.replace("Key=SpaceBar)", "Key=J)");
  const file = modified("Config/DefaultInput.ini", before, after, 20);
  const property = file.changes[0].properties[0];
  assert.equal(file.changes[0].label, "/Script/Engine.InputSettings");
  assert.equal(property.name, "Entries (ordered)");
  assert.equal(property.oldLine, 21);
  assert.equal(property.newLine, 21);
  assert.match(property.before!, /\.Bindings=.*SpaceBar/);
  assert.match(property.after!, /\+Bindings=.*Key=J/);
  assert.equal(property.after!.split("\n").length, 3);
  assert.equal(
    reviewCommentTarget(file, { side: "after", line: 23 }),
    propertyCommentTarget(file.changes[0].id, property.name),
  );
  assert.equal(reviewCommentTarget(file, { side: "after", line: 24 }), undefined);
  const unknown = modified("Config/DefaultGame.ini", "Health=10", "Health=20", 40);
  assert.equal(unknown.changes[0].kind, "unknown");
  assert.equal(unknown.changes[0].properties[0].after, "20");
});

test("descriptor comment ranges include keys, multiline separators and nested JSON", () => {
  const before = '{\n"Modules"\n:\n[\n {"Name":"Old"}\n]\n}';
  const after = before.replace('"Old"', '"New"');
  const file = modified("Game.uproject", before, after);
  const property = file.changes[0].properties[0];
  assert.equal(property.name, "Modules");
  assert.equal(property.newLine, 2);
  assert.equal(property.after!.split("\n").length, 5);
  for (const side of ["before", "after"] as const) {
    for (const line of [2, 3, 4, 5, 6])
      assert.equal(
        reviewCommentTarget(file, { side, line }),
        propertyCommentTarget(file.changes[0].id, "Modules"),
      );
    assert.equal(reviewCommentTarget(file, { side, line: 7 }), undefined);
  }
});

test("Unreal root markers, mixed engines and tab messages use the Unreal palette", () => {
  const file = reviewDiff(unityPatch("Game.uproject", [project]))[0];
  const snapshot = { reviewKey: "one", title: "test", status: "ready" as const, files: [file] };
  assert.equal(reviewEngines([file]), "Unreal");
  assert.equal(repositoryTheme(snapshot), "unreal");
  assert.equal(reviewTheme(snapshot), "unreal");
  const mixed = {
    ...snapshot,
    files: [file, { ...file, filePath: "Player.tscn" }, { ...file, filePath: "Player.prefab" }],
  };
  assert.equal(reviewEngines(mixed.files), "Godot & Unity & Unreal");
  assert.equal(repositoryTheme(mixed), "mixed");
  assert.equal(reviewTheme(mixed), "github");
  for (const item of mixed.files) assert.equal(reviewTheme(mixed, item), reviewEngine(item));
  assert.equal(isReviewSnapshot({ ...snapshot, repositoryTheme: "unreal" }), true);
  const revision = "a".repeat(40);
  const tree = (path: string, contentType = "file") => ({
    payload: {
      codeViewTreeRoute: {
        path: "",
        refInfo: { currentOid: revision },
        tree: { items: [{ path, contentType }] },
      },
    },
  });
  assert.equal(repositoryTreeTheme(tree("Game.uproject"), revision), "unreal");
  assert.equal(repositoryTreeTheme(tree("Tools.uplugin"), revision), "unreal");
  assert.equal(repositoryTreeTheme(tree("Game.uproject", "directory"), revision), "github");
  assert.equal(repositoryTreeTheme(tree("unreal-named-repository.txt"), revision), "github");
  assert.equal(repositoryTreeTheme(tree("Nested/Game.uproject"), revision), "github");
  assert.deepEqual(
    iconThemeRequest(
      { action: "SET_ICON_THEME", theme: "unreal", reviewKey: "/example/game/pull/1" },
      {
        id: "extension",
        frameId: 0,
        url: "https://github.com/example/game/pull/1/changes",
        tab: { id: 9 },
      },
      "extension",
    ),
    { tabId: 9, theme: "unreal" },
  );
  assert.equal(actionIconTitle("unreal"), "SceneSleuth · Unreal review");
});

test("Unreal config compares explicit sections and retains empty values and quoted punctuation", () => {
  const old =
    '[/Script/EngineSettings.GameMapsSettings]\nGameDefaultMap=/Game/Maps/Lobby.Lobby\nEmpty=\n[Display]\nTitle="A; B=C"';
  const before = parseUnrealConfig(lines(old), "hunk-0");
  const after = parseUnrealConfig(lines(old.replace("Lobby.Lobby", "Arena.Arena")), "hunk-0");
  assert.equal(after.sections[0].properties.get("Empty")?.raw, "");
  assert.equal(after.sections[1].properties.get("Title")?.raw, '"A; B=C"');
  const changes = compareSections(before.sections, after.sections, true);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].label, "/Script/EngineSettings.GameMapsSettings");
  assert.equal(changes[0].properties[0].name, "GameDefaultMap");
  assert.equal(changes[0].properties[0].newLine, 2);
});

test("array operators, duplicate keys and interleaved order are not collapsed or evaluated", () => {
  const source =
    '[/Script/Engine.InputSettings]\n!AxisMappings=ClearArray\n+AxisMappings=(AxisName="Move",Key=W,Scale=1)\nbUseMouse=True\n.AxisMappings=(AxisName="Move",Key=W,Scale=1)\n-AxisMappings=(AxisName="Move",Key=S,Scale=-1)';
  const parsed = parseUnrealConfig(lines(source), "hunk-0");
  const properties = parsed.sections[0].properties;
  assert.equal(properties.size, 1);
  assert.equal(properties.get("Entries (ordered)")?.raw, source.slice(source.indexOf("\n") + 1));
  assert.equal(properties.get("Entries (ordered)")?.line, 2);
  const reordered = source.replace(
    'bUseMouse=True\n.AxisMappings=(AxisName="Move",Key=W,Scale=1)',
    '.AxisMappings=(AxisName="Move",Key=W,Scale=1)\nbUseMouse=True',
  );
  assert.equal(
    compareSections(
      parsed.sections,
      parseUnrealConfig(lines(reordered), "hunk-0").sections,
      true,
    )[0].properties[0].operation,
    "modified",
  );
  const duplicate = parseUnrealConfig(lines("[Bindings]\nKey=A\nOther=X\nKey=B"), "hunk-0");
  assert.equal(
    duplicate.sections[0].properties.get("Entries (ordered)")?.raw,
    "Key=A\nOther=X\nKey=B",
  );
});

test("config fragments and repeated headers preserve uncertainty and hunk isolation", () => {
  const first = parseUnrealConfig(lines("Value=1", 50), "hunk-0");
  const next = parseUnrealConfig(lines("Value=2", 70), "hunk-1");
  assert.equal(first.sections[0].kind, "unknown");
  assert.notEqual(first.sections[0].id, next.sections[0].id);
  const repeated = parseUnrealConfig(lines("[One]\nValue=1\n[One]\nValue=2"), "hunk-0");
  assert.equal(repeated.sections[0].kind, "unknown");
  assert.match(repeated.sections[0].properties.get("Source")!.raw, /Value=1\n\[One\]\nValue=2/);
  assert.notEqual(
    parseUnrealConfig(lines("[One]\nValue=1"), "hunk-0").sections[0].id,
    parseUnrealConfig(lines("[One]\nValue=2"), "hunk-1").sections[0].id,
  );
});

test("multiline structs, truncation recovery and bounded parsing keep source evidence", () => {
  const parsed = parseUnrealConfig(
    lines('[One]\nThing=(X=1,\nY=2)\n[Two]\nValue="unterminated\n[Three]\nValue=3'),
    "hunk-0",
  );
  assert.equal(parsed.sections[0].properties.get("Thing")?.raw, "(X=1,\nY=2)");
  assert.equal(parsed.sections[2].properties.get("Value")?.raw, "3");
  assert.equal(parsed.sections[1].properties.get("Entries (ordered)")?.incomplete, true);
  assert.ok(parsed.diagnostics.some((note) => note.includes("Incomplete")));
  const large = parseUnrealDescriptor(
    lines('{"Value":"' + "x".repeat(1_000_001) + '"}'),
    "hunk-0",
    "unreal_project",
    true,
  );
  assert.equal(large.sections[0].kind, "unknown");
  assert.match(large.diagnostics[0], /limit/);
});
