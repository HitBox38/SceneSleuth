import type { SceneReview } from "./model.ts";

export type GodotFileKind = "scene" | "project" | "resource";

export function godotFileKind(path?: string): GodotFileKind | undefined {
  if (path?.endsWith(".tscn")) return "scene";
  if (path?.endsWith(".godot")) return "project";
  if (path?.endsWith(".tres")) return "resource";
}

export function reviewViewLabel(file: Pick<SceneReview, "filePath" | "previousPath">): string {
  return { scene: "Scene", project: "Settings", resource: "Resource" }[reviewFileKind(file)];
}

export function reviewFileKind(
  file: Pick<SceneReview, "filePath" | "previousPath">,
): GodotFileKind {
  return godotFileKind(file.filePath) ?? godotFileKind(file.previousPath) ?? "scene";
}
