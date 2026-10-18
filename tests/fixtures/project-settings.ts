import { reviewDiff } from "../../content_script/scripts/diffParser.ts";

export const projectPath = "Demos/coop/project.godot";
const body = [
  " ; Engine configuration",
  " config_version=5",
  " [application]",
  '-config/name="Coop"',
  '+config/name="Coop Adventure"',
  '-config/icon="res://Assets/old.png"',
  '+config/icon="res://Assets/light.png"',
  " [autoload]",
  '-Game="res://Scripts/old.gd"',
  '+Game="*res://Scripts/light_controller.gd"',
  " [input]",
  " jump={",
  '-"deadzone": 0.2,',
  '+"deadzone": 0.3,',
  ' "events": [Object(InputEventKey,"physical_keycode":32)]',
  " }",
  " [rendering]",
  '-renderer/rendering_method="gl_compatibility"',
  '+renderer/rendering_method="mobile"',
  " [replication]",
  '-config={"uid://fixture": {"replicated": false, "sync_properties": [&":position"]}}',
  '+config={"uid://fixture": {"replicated": true, "sync_properties": [&":position", &":velocity"], "note": "<img src=x onerror=alert(1)>"}}',
];
export const projectLines = [
  `@@ -1,${body.filter((line) => !line.startsWith("+")).length} +1,${body.filter((line) => !line.startsWith("-")).length} @@`,
  ...body,
];
export const projectReview = reviewDiff(
  `diff --git a/${projectPath} b/${projectPath}\n--- a/${projectPath}\n+++ b/${projectPath}\n${projectLines.join("\n")}\n`,
)[0];
