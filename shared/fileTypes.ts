import type { SceneReview } from "./model.ts";

export type GodotFileKind = "scene" | "project" | "resource" | "import" | "export";

export type ReviewFileKind =
  | GodotFileKind
  | "unity_scene"
  | "unity_prefab"
  | "unity_asset"
  | "unity_material"
  | "unity_metadata"
  | "unity_controller"
  | "unity_override"
  | "unity_animation";

export function supportedFileKind(path?: string): ReviewFileKind | undefined {
  if (path?.split("/").includes(".godot")) return;
  if (path?.endsWith(".tscn")) return "scene";
  if (path?.endsWith(".godot")) return "project";
  if (path?.endsWith(".tres")) return "resource";
  if (path?.endsWith(".import")) return "import";
  if (path?.split("/").pop() === "export_presets.cfg") return "export";
  if (path?.endsWith(".unity")) return "unity_scene";
  if (path?.endsWith(".prefab")) return "unity_prefab";
  if (path?.endsWith(".asset")) return "unity_asset";
  if (path?.endsWith(".mat")) return "unity_material";
  if (path?.endsWith(".meta")) return "unity_metadata";
  if (path?.endsWith(".controller")) return "unity_controller";
  if (path?.endsWith(".overrideController")) return "unity_override";
  if (path?.endsWith(".anim")) return "unity_animation";
}

export function reviewViewLabel(file: Pick<SceneReview, "filePath" | "previousPath">): string {
  return {
    scene: "Scene",
    project: "Settings",
    resource: "Resource",
    import: "Import settings",
    export: "Export",
    unity_scene: "Scene",
    unity_prefab: "Prefab",
    unity_asset: "Asset",
    unity_material: "Material",
    unity_metadata: "Import settings",
    unity_controller: "Controller",
    unity_override: "Overrides",
    unity_animation: "Animation",
  }[reviewFileKind(file)];
}

export function reviewFileKind(
  file: Pick<SceneReview, "filePath" | "previousPath">,
): ReviewFileKind {
  return supportedFileKind(file.filePath) ?? supportedFileKind(file.previousPath) ?? "scene";
}

export function reviewEngine(
  file: Pick<SceneReview, "filePath" | "previousPath">,
): "godot" | "unity" {
  return reviewFileKind(file).startsWith("unity_") ? "unity" : "godot";
}
export function reviewEngines(files: Pick<SceneReview, "filePath" | "previousPath">[]): string {
  const engines = new Set(files.map(reviewEngine));
  return engines.size === 1 ? (engines.has("unity") ? "Unity" : "Godot") : "Godot & Unity";
}

export function godotSettingsClass(kind: ReviewFileKind): string | undefined {
  if (kind === "project") return "ProjectSettings";
  if (kind === "import") return "ResourceImporter";
  if (kind === "export") return "ExportPreset";
}
export function isSettingsFile(file: Pick<SceneReview, "filePath" | "previousPath">): boolean {
  return godotSettingsClass(reviewFileKind(file)) !== undefined;
}
