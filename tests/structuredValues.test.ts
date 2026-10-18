import assert from "node:assert/strict";
import { test } from "node:test";
import { structuredValue } from "../ui/structuredValues.ts";
import { projectReview } from "./fixtures/project-settings.ts";
import { sceneReferenceResolver } from "../content_script/scripts/sceneReferences.ts";
import { parseScene, sourceLines } from "../content_script/scripts/contentParser.ts";

test("project input changes retain both deadzones and nested Godot event fields", () => {
  const property = projectReview.changes.find((change) => change.path === "input")!.properties[0];
  for (const [side, expected] of [
    ["before", "0.2"],
    ["after", "0.3"],
  ] as const) {
    const raw = property[side]!;
    const tree = structuredValue(raw)!;
    assert.equal(tree.kind, "dictionary");
    const [deadzone, events] = tree.entries!;
    assert.equal(deadzone.label, "deadzone");
    assert.equal(raw.slice(deadzone.value.start, deadzone.value.end), expected);
    const event = events.value.entries![0].value;
    assert.equal(event.label, "InputEventKey");
    assert.equal(event.entries![0].label, "physical_keycode");
    assert.equal(raw.slice(event.entries![0].value.start, event.entries![0].value.end), "32");
  }
});

test("nested collections preserve duplicate keys, order, exact values and quoted delimiters", () => {
  const raw = ' {"a,:}": ["escaped \\\"[,]\\\"", {}, []], "same": 1, "same": 2, &"flag": true, } ';
  const tree = structuredValue(raw)!;
  assert.deepEqual(
    tree.entries!.map((entry) => entry.label),
    ["a,:}", "same", "same", '&"flag"'],
  );
  assert.equal(tree.entries![0].value.entries!.length, 3);
  assert.deepEqual(tree.entries![0].value.entries![1].value.entries, []);
  assert.equal(raw.slice(tree.entries![2].value.start, tree.entries![2].value.end), "2");
});

test("reference expressions keep source offsets within nested values", () => {
  const sections = parseScene(
    sourceLines('[ext_resource type="Script" path="res://script.gd" id="1"]'),
  ).sections;
  const raw = '{"nested": [ExtResource("1"), Vector2(1, 2), Unknown("x,y")] }';
  const leaf = structuredValue(raw)!.entries![0].value.entries![0].value;
  const reference = sceneReferenceResolver(sections)(raw)[0];
  assert.equal(reference.start, leaf.start);
  assert.equal(reference.end, leaf.end);
  assert.equal(raw.slice(leaf.start, leaf.end), 'ExtResource("1")');
  assert.equal(reference.label, "script.gd");
  const keyed = '{ExtResource("1"): "value", "": false}';
  const entries = structuredValue(keyed)!.entries!;
  assert.equal(keyed.slice(entries[0].key!.start, entries[0].key!.end), 'ExtResource("1")');
  assert.equal(entries[1].label, '""');
});

test("partial, malformed, commented and oversized collections keep raw presentation", () => {
  for (const raw of [
    '{"x": [1, 2}',
    "[1,,2]",
    '{"x":}',
    "{:1}",
    '{"x":1} {}',
    'Object(123,"x":1)',
    '{"x":1; comment\n}',
    "[".repeat(15) + "0" + "]".repeat(15),
    "[" + Array(401).fill("0").join(",") + "]",
    '["' + "x".repeat(32768) + '"]',
  ]) {
    assert.equal(structuredValue(raw), undefined, raw.slice(0, 60));
  }
  assert.equal(structuredValue('PackedStringArray("a", "b")'), undefined);
  assert.equal(structuredValue('"{not a collection}"'), undefined);
});

test("executable-looking text is preserved as a literal rather than evaluated", () => {
  const raw =
    '{"html": "<img src=x onerror=alert(1)>", "expression": unknown.run(), "__proto__": {"safe": true}}';
  const tree = structuredValue(raw)!;
  assert.equal(tree.entries![0].value.kind, "literal");
  assert.equal(tree.entries![1].value.kind, "literal");
  assert.equal(tree.entries![2].label, "__proto__");
  assert.equal(
    raw.slice(tree.entries![1].value.start, tree.entries![1].value.end),
    "unknown.run()",
  );
});
