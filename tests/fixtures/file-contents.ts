import { reviewDiff } from "../../content_script/scripts/diffParser.ts";

export const referencedScenePath = "Scenes/lamp.tscn";
export const referencedSceneSource = [
  "[gd_scene format=3]",
  '[ext_resource type="Script" path="res://Scripts/light_controller.gd" id="1"]',
  '[ext_resource type="Texture2D" path="res://Assets/light.png" id="2"]',
  '[ext_resource type="PackedScene" path="res://Scenes/spark.tscn" id="3"]',
  '[sub_resource type="ShaderMaterial" id="Material_local"]',
  'resource_name = "Warm <glow>"',
  "shader_parameter/energy = 0.75",
  '[node name="Lamp" type="Node2D"]',
  "position = Vector2(10, 20)",
  'script = ExtResource("1")',
  'material = SubResource("Material_local")',
  'textures = Array[Texture2D]([ExtResource("2"), ExtResource("2")])',
  'effect_scene = ExtResource("3")',
  'sprite = NodePath("Sprite2D")',
  'unresolved = ExtResource("outside_this_diff")',
  '[node name="Sprite2D" type="Sprite2D" parent="."]',
  'owner_node = NodePath("..")',
  '[connection signal="ready" from="." to="." method="_on_ready"]',
];
export const referencedSceneReview = reviewDiff(
  `diff --git a/${referencedScenePath} b/${referencedScenePath}\n--- /dev/null\n+++ b/${referencedScenePath}\n@@ -0,0 +1,${referencedSceneSource.length} @@\n${referencedSceneSource.map((line) => `+${line}`).join("\n")}\n`,
)[0]!;

export const changedReferenceLines = [
  "@@ -1,5 +1,5 @@",
  ' [ext_resource type="PackedScene" path="res://Scenes/spark.tscn" id="1"]',
  ' [ext_resource type="PackedScene" path="res://Scenes/flame.tscn" id="2"]',
  ' [node name="Lamp" type="Node2D"]',
  '-effect_scene = ExtResource("1")',
  '+effect_scene = ExtResource("2")',
  " energy = 0.75",
];
export const changedReferenceReview = reviewDiff(
  `diff --git a/${referencedScenePath} b/${referencedScenePath}\n--- a/${referencedScenePath}\n+++ b/${referencedScenePath}\n${changedReferenceLines.join("\n")}\n`,
)[0]!;
