import type { SceneReview } from "./model.ts";

export type GodotFileKind = "scene" | "project" | "resource";

export type ReviewFileKind = GodotFileKind | "unity_scene" | "unity_prefab" | "unity_asset";

export function supportedFileKind(path?: string): ReviewFileKind | undefined {
  if (path?.endsWith(".tscn")) return "scene";
  if (path?.endsWith(".godot")) return "project";
  if (path?.endsWith(".tres")) return "resource";
  if (path?.endsWith(".unity")) return "unity_scene";
  if (path?.endsWith(".prefab")) return "unity_prefab";
  if (path?.endsWith(".asset")) return "unity_asset";
}

export function reviewViewLabel(file: Pick<SceneReview, "filePath" | "previousPath">): string {
  return {
    scene: "Scene",
    project: "Settings",
    resource: "Resource",
    unity_scene: "Scene",
    unity_prefab: "Prefab",
    unity_asset: "Asset",
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
