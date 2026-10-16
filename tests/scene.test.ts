import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalValue,
  compareSections,
  parseScene,
  sourceLines,
} from "../content_script/scripts/contentParser.ts";
const parse = (text: string) => parseScene(sourceLines(text));

test("properties belong to their node; duplicate names under different parents stay distinct", () => {
  const old =
    '[node name="Root" type="Node2D"]\n[node name="Sprite" type="Sprite2D" parent="Left"]\nposition = Vector2(1, 2)\n[node name="Sprite" type="Sprite2D" parent="Right"]\nposition = Vector2(3, 4)';
  const after = old.replace("Vector2(3, 4)", "Vector2(7, 8)");
  const changes = compareSections(parse(old).sections, parse(after).sections, false);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].path, "Right/Sprite");
  assert.deepEqual(
    changes[0].properties.map((p) => [p.name, p.before, p.after]),
    [["position", "Vector2(3, 4)", "Vector2(7, 8)"]],
  );
});
test("resource kind, class, and diff operation are independent", () => {
  const scene = parse('[sub_resource type="CircleShape2D" id="Circle_1"]\nradius = 8');
  const [change] = compareSections([], scene.sections, false);
  assert.equal(change.kind, "sub_resource");
  assert.equal(change.className, "CircleShape2D");
  assert.equal(change.operation, "added");
});
test("references, slash keys, and multiline typed values are preserved without evaluation", () => {
  const text =
    '[node name="Player" type="Node2D"]\nscript = ExtResource("script_1")\nanimation/frames = [{\n"texture": SubResource("texture_1"),\n"duration": 1.0\n}]\nexpression = process.exit()';
  const scene = parse(text);
  assert.deepEqual(scene.diagnostics, []);
  assert.equal(scene.sections[0].properties.get("script")?.raw, 'ExtResource("script_1")');
  assert.ok(scene.sections[0].properties.get("animation/frames")?.raw.includes('"duration": 1.0'));
  assert.equal(scene.sections[0].properties.get("expression")?.raw, "process.exit()");
});
test("formatting outside strings is insignificant; spaces and delimiters inside strings are preserved", () => {
  assert.equal(canonicalValue("Vector2(1, 2) ; comment"), canonicalValue("Vector2( 1,2 )"));
  assert.notEqual(canonicalValue('"a b"'), canonicalValue('"ab"'));
  const value = '"quoted \\";=[]\\" value"';
  assert.equal(
    parse(`[node name="Root"]\ntext = ${value}`).sections[0].properties.get("text")?.raw,
    value,
  );
});
test("header attributes and connection changes are reported", () => {
  const before =
    '[node name="Player" type="Node2D" groups=["old"]]\n[connection signal="hit" from="Area" to="." method="_hit"]';
  const after = before.replace('["old"]', '["new"]').replace('method="_hit"', 'method="_damage"');
  const changes = compareSections(parse(before).sections, parse(after).sections, false);
  assert.equal(changes[0].properties[0].name, "@groups");
  assert.equal(changes.filter((change) => change.kind === "connection").length, 2);
});
test("truncated values produce diagnostics and retain their source text", () => {
  const result = parse('[node name="Root"]\nframes = [\n1, 2');
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.sections[0].properties.get("frames")?.raw, "[\n1, 2");
});

test("unsupported sections never attach their properties to the preceding node", () => {
  const result = parse(
    '[node name="Root"]\nposition = Vector2(1, 2)\n[future_section id="new"]\nvalue = 42',
  );
  assert.equal(result.sections[0].properties.has("value"), false);
  assert.equal(result.sections[1].kind, "unknown");
  assert.ok(result.diagnostics.some((note) => note.includes("Unsupported section")));
});
