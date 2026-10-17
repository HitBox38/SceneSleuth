import test from "node:test";
import assert from "node:assert/strict";
import { inspectorValue, propertyGroups } from "../ui/propertyPresentation.ts";
import { reviewDiff } from "../content_script/scripts/diffParser.ts";

test("inspector vectors retain exact signed, decimal, and exponent source components", () => {
  assert.deepEqual(inspectorValue("Vector3(-1.2500, +2e-3, .5)")?.components, [
    { label: "x", value: "-1.2500" },
    { label: "y", value: "+2e-3" },
    { label: "z", value: ".5" },
  ]);
  assert.equal(inspectorValue("Vector4i(1, 2, 3, 4)")?.components[3].label, "w");
});
test("unsupported and executable-looking values remain raw", () => {
  for (const raw of [
    "Vector2(1, 2) + Vector2(3, 4)",
    "Vector2(1, call())",
    "Vector2(1, 2, 3)",
    "Vector2i(1.5, 2)",
    "Vector2(NAN, INF)",
    "Vector2(1e999, 0)",
    '"Vector2(1, 2)"',
    'Color("red")',
    "Color(1, 0, 0)",
    "Color(2, 0, 0, 1)",
    "Color(0, 0, 0, -1)",
    '<img src=x onerror="alert(1)">',
  ])
    assert.equal(inspectorValue(raw), undefined, raw);
});
test("color swatches preserve alpha and exact numeric labels", () => {
  const color = inspectorValue("Color(0.5, 0.25, 1, 0.125)");
  assert.equal(color?.swatch, "rgba(127.5, 63.75, 255, 0.125)");
  assert.equal(color?.components[3].value, "0.125");
});
test("property grouping retains every change and does not classify resource or custom fields as transforms", () => {
  const [scene] = reviewDiff(
    'diff --git a/a.tscn b/a.tscn\n--- /dev/null\n+++ b/a.tscn\n@@ -0,0 +1,6 @@\n+[node name="Player" type="CharacterBody2D"]\n+position = Vector2(1, 2)\n+scale = Vector2(1, 1)\n+visible = true\n+collision_mask = 2\n+custom_value = 9\n',
  );
  const node = scene.changes[0];
  const groups = propertyGroups(node);
  assert.deepEqual(
    groups.map((group) => group.label),
    ["Properties", "Transform", "Visibility", "Collision"],
  );
  assert.equal(groups.flatMap((group) => group.properties).length, node.properties.length);
  assert.ok(
    groups
      .flatMap((group) => group.properties)
      .every((property) => node.properties.includes(property)),
  );
  assert.deepEqual(
    propertyGroups({ ...node, kind: "sub_resource" }).map((group) => group.label),
    ["Properties"],
  );
  assert.deepEqual(
    propertyGroups({ ...node, className: "CustomClass" }).map((group) => group.label),
    ["Properties"],
  );
});
