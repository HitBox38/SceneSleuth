import type { SceneReview } from "./model.ts";

export type GodotFileKind = "scene" | "project";

export function godotFileKind(path?: string): GodotFileKind | undefined {
  if (path?.endsWith(".tscn")) return "scene";
  if (path?.endsWith(".godot")) return "project";
}

export function reviewFileKind(
  file: Pick<SceneReview, "filePath" | "previousPath">,
): GodotFileKind {
  return godotFileKind(file.filePath) ?? godotFileKind(file.previousPath) ?? "scene";
}
