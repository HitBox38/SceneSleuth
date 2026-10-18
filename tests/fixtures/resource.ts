import { reviewDiff } from "../../content_script/scripts/diffParser.ts";

export const resourcePath = "Demos/coop/tileset.tres";
export const resourceSource = [
  '[gd_resource type="TileSet" format=3]',
  '[ext_resource type="Texture2D" path="res://Assets/light.png" id="1"]',
  '[sub_resource type="TileSetAtlasSource" id="Atlas_main"]',
  'texture = ExtResource("1")',
  "texture_region_size = Vector2i(48, 48)",
  "0:0/0/physics_layer_0/polygon_0/points = PackedVector2Array(-24, -24, 24, -24, 24, 24)",
  "[resource]",
  'resource_name = "Coop Tiles"',
  'sources/0 = SubResource("Atlas_main")',
  'custom_data = {"walkable": true, "costs": [1, 2, 3]}',
  "tile_size = Vector2i(48, 48)",
];
export const resourceLines = [
  `@@ -0,0 +1,${resourceSource.length} @@`,
  ...resourceSource.map((line) => `+${line}`),
];
export const resourcePatch = `diff --git a/${resourcePath} b/${resourcePath}\n--- /dev/null\n+++ b/${resourcePath}\n${resourceLines.join("\n")}\n`;
export const resourceReview = reviewDiff(resourcePatch)[0];
