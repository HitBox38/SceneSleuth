import type { ReviewSnapshot, SceneReview } from "./model.ts";
import { supportedFileKind } from "./fileTypes.ts";

export type EngineTheme = "github" | "godot" | "unity";
export type RepositoryTheme = EngineTheme | "mixed";
type ThemeSnapshot = Pick<ReviewSnapshot, "files" | "navigation" | "repositoryTheme">;

function projectMarker(path: string): { engine: EngineTheme; root: string } | undefined {
  if (/(?:^|\/)project\.godot$/.test(path))
    return { engine: "godot", root: path.slice(0, -"project.godot".length) };
  if (/(?:^|\/)ProjectSettings\/ProjectVersion\.txt$/.test(path))
    return { engine: "unity", root: path.slice(0, -"ProjectSettings/ProjectVersion.txt".length) };
}
function combine(engines: Set<EngineTheme>): RepositoryTheme {
  return engines.size > 1 ? "mixed" : (engines.values().next().value ?? "github");
}
export function repositoryTheme(snapshot: ThemeSnapshot): RepositoryTheme {
  if (snapshot.repositoryTheme && snapshot.repositoryTheme !== "github")
    return snapshot.repositoryTheme;
  const paths = [
    ...snapshot.files.map((file) => file.filePath),
    ...(snapshot.navigation?.files.map((file) => file.path) ?? []),
  ];
  const markers = paths.flatMap((path) => projectMarker(path) ?? []);
  const engines = new Set<EngineTheme>(markers.map((marker) => marker.engine));
  for (const path of paths) {
    const kind = supportedFileKind(path);
    if (kind) engines.add(kind.startsWith("unity_") ? "unity" : "godot");
  }
  return combine(engines);
}
export function reviewTheme(
  snapshot: ThemeSnapshot,
  file?: Pick<SceneReview, "filePath" | "previousPath">,
): EngineTheme {
  const repository = repositoryTheme(snapshot);
  if (repository === "godot" || repository === "unity") return repository;
  if (!file) return "github";
  const markers = (snapshot.navigation?.files ?? []).flatMap(
    ({ path }) => projectMarker(path) ?? [],
  );
  const kind = supportedFileKind(file.filePath) ?? supportedFileKind(file.previousPath);
  const scope = markers
    .filter(({ root }) => file.filePath.startsWith(root))
    .sort((a, b) => b.root.length - a.root.length)[0];
  if (scope && !kind) return scope.engine;
  return kind ? (kind.startsWith("unity_") ? "unity" : "godot") : "github";
}
