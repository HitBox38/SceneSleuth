import { reviewDiff } from "../../content_script/scripts/diffParser.ts";

export const referencedScenePath = "Scenes/lamp.tscn";
export const referencedSceneSource = [
  "[gd_scene format=3]",
  '[ext_resource type="Script" path="res://Scripts/light_controller.gd" id="1"]',
  '[ext_resource type="Texture2D" path="res://Assets/light.png" id="2"]',
  '[sub_resource type="ShaderMaterial" id="Material_local"]',
  "shader_parameter/energy = 0.75",
  '[node name="Lamp" type="Node2D"]',
  "position = Vector2(10, 20)",
  'script = ExtResource("1")',
  '[connection signal="ready" from="." to="." method="_on_ready"]',
];
export const referencedSceneReview = reviewDiff(
  `diff --git a/${referencedScenePath} b/${referencedScenePath}\n--- /dev/null\n+++ b/${referencedScenePath}\n@@ -0,0 +1,${referencedSceneSource.length} @@\n${referencedSceneSource.map((line) => `+${line}`).join("\n")}\n`,
)[0]!;
