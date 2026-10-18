import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewDiff } from "../content_script/scripts/diffParser.ts";
import { reviewViewLabel } from "../shared/fileTypes.ts";
import { unityStructuredValue, unityInspectorValue } from "../ui/unityPresentation.ts";
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
