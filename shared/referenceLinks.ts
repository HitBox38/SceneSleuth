import type { ReferenceNavigation, SceneReview, ValueReference } from "./model.ts";

function parseUrl(value: string, base?: string) {
  try {
    return new URL(value, base);
  } catch {
    return undefined;
  }
}

function unsafePathCharacters(value: string) {
  return (
    value.includes("\\") ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  );
}

export function navigationContext(changesUrl: string): ReferenceNavigation | undefined {
  const url = parseUrl(changesUrl);
  if (!url) return;
  const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/\d+\/(?:changes|files)(?:\/|$)/);
  if (url.origin !== "https://github.com" || !match) return;
  return { changesUrl, repositoryUrl: `${url.origin}/${match[1]}/${match[2]}`, files: [] };
}

// Resolve Godot paths as repository paths, never as navigable URLs. Plain paths
// are scene-relative; res:// stays within the known Godot project directory.
export function referencedFilePath(
  resourcePath: string,
  scenePath: string,
  projectRoot = "",
): string | undefined {
  if (!resourcePath || unsafePathCharacters(resourcePath)) return;
  const projectPath = resourcePath.startsWith("res://");
  if (!projectPath && (/^[\w+.-]+:/.test(resourcePath) || resourcePath.startsWith("/"))) return;
  const root = projectRoot ? projectRoot.split("/") : [];
  if (root.some((part) => !part || part === "." || part === ".." || unsafePathCharacters(part)))
    return;
  const parts = projectPath ? [...root] : scenePath.split("/").slice(0, -1);
  const boundary = projectPath ? root.length : 0;
  for (const part of (projectPath ? resourcePath.slice(6) : resourcePath).split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length <= boundary) return;
      parts.pop();
    } else parts.push(part);
  }
  return parts.length > boundary ? parts.join("/") : undefined;
}

export function referenceFilePath(
  reference: ValueReference,
  file: SceneReview,
  side: "before" | "after",
  navigation: ReferenceNavigation,
) {
  if (reference.unityGuid) {
    if (!/^[a-f\d]{32}$/i.test(reference.unityGuid)) return;
    const paths = new Set(
      navigation.files
        .filter((target) => {
          if (side === "before" ? target.status === "added" : target.status === "removed")
            return false;
          return (
            (side === "before" ? target.unityGuidBefore : target.unityGuidAfter) ===
            reference.unityGuid
          );
        })
        .flatMap((target) => {
          const path = side === "before" ? (target.previousPath ?? target.path) : target.path;
          return path.endsWith(".meta") ? [referencedFilePath(path.slice(0, -5), "")] : [];
        })
        .filter((path): path is string => !!path),
    );
    return paths.size === 1 ? [...paths][0] : undefined;
  }
  const resourcePath = reference.resourcePath;
  if (!resourcePath) return;
  const scenePath = side === "before" ? (file.previousPath ?? file.filePath) : file.filePath;
  let projectRoot = "";
  // The PR's file listing is evidence of project boundaries. Do not guess a
  // directory from matching basenames: a repo can contain many independent games.
  for (const target of navigation.files) {
    if (side === "before" ? target.status === "added" : target.status === "removed") continue;
    const path = side === "before" ? (target.previousPath ?? target.path) : target.path;
    if (!path.endsWith("/project.godot")) continue;
    const directory = path.slice(0, -"/project.godot".length);
    if (scenePath.startsWith(`${directory}/`) && directory.length > projectRoot.length)
      projectRoot = directory;
  }
  return referencedFilePath(resourcePath, scenePath, projectRoot);
}

export function referenceLink(
  reference: ValueReference,
  file: SceneReview,
  side: "before" | "after",
  navigation?: ReferenceNavigation,
): { href: string; inReview: boolean } | undefined {
  if ((!reference.resourcePath && !reference.unityGuid) || !navigation) return;
  const path = referenceFilePath(reference, file, side, navigation);
  if (!path) return;
  const target =
    navigation.files.find((candidate) =>
      side === "before"
        ? candidate.status !== "added" && (candidate.previousPath ?? candidate.path) === path
        : candidate.status !== "removed" && candidate.path === path,
    ) ??
    navigation.files.find(
      (candidate) => candidate.path === path || candidate.previousPath === path,
    );
  if (target?.reviewUrl) {
    const url = parseUrl(target.reviewUrl, navigation.changesUrl);
    const changes = parseUrl(navigation.changesUrl);
    if (
      url &&
      changes &&
      url.origin === changes.origin &&
      url.pathname === changes.pathname &&
      url.search === changes.search &&
      /^#diff-[\w-]+$/.test(url.hash)
    )
      return { href: url.href, inReview: true };
  }
  const href = repositoryFileUrl(path, side, navigation, "blob");
  return href ? { href, inReview: false } : undefined;
}

function repositoryFileUrl(
  path: string,
  side: "before" | "after",
  navigation: ReferenceNavigation,
  view: "blob" | "raw",
) {
  const repository = parseUrl(navigation.repositoryUrl);
  if (
    !repository ||
    repository.origin !== "https://github.com" ||
    !/^\/[^/]+\/[^/]+$/.test(repository.pathname)
  )
    return;
  const revision = side === "before" ? navigation.beforeRevision : navigation.afterRevision;
  const ref = revision && /^[a-f\d]{40,64}$/i.test(revision) ? revision : "HEAD";
  return `${repository.origin}${repository.pathname}/${view}/${ref}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function referenceImageSource(
  reference: ValueReference,
  file: SceneReview,
  side: "before" | "after",
  navigation?: ReferenceNavigation,
): string | undefined {
  if ((!reference.resourcePath && !reference.unityGuid) || !navigation) return;
  const path = referenceFilePath(reference, file, side, navigation);
  if (!path || !/\.(?:png|apng|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(path)) return;
  // Start on github.com so private repositories can use the existing sign-in.
  // Images are rendered as images, including SVG; scene text is never executed.
  return repositoryFileUrl(path, side, navigation, "raw");
}
