import type { ReferenceNavigation, SceneReview, ValueReference } from "./model.ts";

function parseUrl(value: string, base?: string) {
  try {
    return new URL(value, base);
  } catch {
    return undefined;
  }
}

export function navigationContext(changesUrl: string): ReferenceNavigation | undefined {
  const url = parseUrl(changesUrl);
  if (!url) return;
  const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/\d+\/(?:changes|files)(?:\/|$)/);
  if (url.origin !== "https://github.com" || !match) return;
  return { changesUrl, repositoryUrl: `${url.origin}/${match[1]}/${match[2]}`, files: [] };
}

// Resolve Godot paths as repository paths, never as navigable URLs. The project
// root for res:// is the repository root; plain paths are relative to the scene.
export function referencedFilePath(resourcePath: string, scenePath: string): string | undefined {
  if (
    !resourcePath ||
    resourcePath.includes("\\") ||
    [...resourcePath].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return;
  const projectPath = resourcePath.startsWith("res://");
  if (!projectPath && (/^[\w+.-]+:/.test(resourcePath) || resourcePath.startsWith("/"))) return;
  const parts = projectPath ? [] : scenePath.split("/").slice(0, -1);
  for (const part of (projectPath ? resourcePath.slice(6) : resourcePath).split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return;
      parts.pop();
    } else parts.push(part);
  }
  return parts.length ? parts.join("/") : undefined;
}

export function referenceLink(
  reference: ValueReference,
  file: SceneReview,
  side: "before" | "after",
  navigation?: ReferenceNavigation,
): { href: string; inReview: boolean } | undefined {
  if (!reference.resourcePath || !navigation) return;
  const path = referencedFilePath(
    reference.resourcePath,
    side === "before" ? (file.previousPath ?? file.filePath) : file.filePath,
  );
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
  if (!reference.resourcePath || !navigation) return;
  const path = referencedFilePath(
    reference.resourcePath,
    side === "before" ? (file.previousPath ?? file.filePath) : file.filePath,
  );
  if (!path || !/\.(?:png|apng|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(path)) return;
  // Start on github.com so private repositories can use the existing sign-in.
  // Images are rendered as images, including SVG; scene text is never executed.
  return repositoryFileUrl(path, side, navigation, "raw");
}
