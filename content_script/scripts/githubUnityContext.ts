import type { ReferenceNavigation, SceneReview } from "../../shared/model.ts";
import { reviewFileKind } from "../../shared/fileTypes.ts";
import { reviewContext } from "../../shared/protocol.ts";
import { githubResponseText } from "./githubLoader.ts";
import { reviewUnityContext } from "./unityContext.ts";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function unityBlobUrl(repositoryUrl: string, revision: string, path: string) {
  const repo = new URL(repositoryUrl);
  if (
    repo.origin !== "https://github.com" ||
    !/^\/[\w.-]+\/[\w.-]+\/?$/.test(repo.pathname) ||
    repo.search ||
    repo.hash ||
    !/^[a-f\d]{40}$/i.test(revision) ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("An exact repository revision is required.");
  return `${repo.origin}${repo.pathname.replace(/\/$/, "")}/blob/${revision}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

// GitHub currently serves both the older single blob payload and partitioned
// code-view payloads. Reject stale routes, binary and truncated source.
export function unityBlobLines(value: unknown, path: string, revision: string): string[] {
  const payload = record(record(value).payload);
  const layout = record(payload.codeViewBlobLayoutRoute ?? payload);
  const blob = record(payload["codeViewBlobLayoutRoute.StyledBlob"] ?? payload.blob);
  const lines = blob.rawLines;
  if (
    layout.path !== path ||
    record(layout.refInfo).currentOid !== revision ||
    blob.isTruncated === true ||
    blob.truncated === true ||
    blob.isBinary === true ||
    !Array.isArray(lines) ||
    lines.length > 50_000 ||
    !lines.every((line): line is string => typeof line === "string" && !/[\r\n\0]/.test(line)) ||
    lines.join("\n").length > 2_000_000 ||
    !lines.some((line) => /^--- !u!\d+ &-?\d+/.test(line))
  )
    throw new Error("GitHub did not return complete Unity text at the requested revision.");
  return lines;
}

export function createUnityContextLoader(options: {
  onFile: (file: SceneReview) => void;
  readBlob: (html: string) => unknown;
  fetch?: typeof fetch;
}) {
  let generation = 0;
  let key = "";
  let controller = new AbortController();
  let active = false;
  let queue: { file: SceneReview; navigation: ReferenceNavigation }[] = [];
  const attempted = new Set<string>();
  const request = options.fetch ?? fetch;
  function clear() {
    generation++;
    controller.abort();
    controller = new AbortController();
    queue = [];
    attempted.clear();
    active = false;
    key = "";
  }
  async function source(
    path: string,
    revision: string,
    nav: ReferenceNavigation,
    signal: AbortSignal,
  ) {
    const response = await request(unityBlobUrl(nav.repositoryUrl, revision, path), {
      credentials: "same-origin",
      redirect: "error",
      signal,
      headers: { Accept: "text/html" },
    });
    const html = await githubResponseText(response);
    return unityBlobLines(options.readBlob(html), path, revision);
  }
  function pump() {
    if (active || !queue.length) return;
    const { file, navigation } = queue.shift()!;
    attempted.add(JSON.stringify([file.filePath, file.rawDiff]));
    active = true;
    const run = generation;
    const fileController = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      fileController.signal,
      AbortSignal.timeout(15_000),
    ]);
    options.onFile({ ...file, sourceContext: "loading" });
    void (async () => {
      try {
        // One file at a time, at most two side requests. No repository crawling.
        const [before, after] = await Promise.all([
          source(
            file.previousPath ?? file.filePath,
            navigation.beforeRevision!,
            navigation,
            signal,
          ),
          source(file.filePath, navigation.afterRevision!, navigation, signal),
        ]);
        const enriched = reviewUnityContext(file, before, after);
        if (run === generation && !signal.aborted) options.onFile(enriched);
      } catch {
        if (run === generation && !controller.signal.aborted)
          options.onFile({ ...file, sourceContext: "unavailable" });
      } finally {
        fileController.abort();
        if (run === generation) {
          active = false;
          pump();
        }
      }
    })();
  }
  return {
    clear,
    update(
      reviewKey: string,
      files: SceneReview[],
      navigation: ReferenceNavigation | undefined,
      mounted: Set<string>,
    ) {
      if (key !== reviewKey) {
        clear();
        key = reviewKey;
      }
      if (!navigation?.beforeRevision || !navigation.afterRevision) return;
      const context = reviewContext(navigation.changesUrl);
      if (
        !context?.isChangesPage ||
        navigation.repositoryUrl !== `https://github.com${context.key.split("/pull/")[0]}`
      )
        return;
      queue = queue.filter(
        ({ file }) =>
          mounted.has(file.filePath) &&
          files.some(
            (current) =>
              current.filePath === file.filePath &&
              current.rawDiff === file.rawDiff &&
              !current.sourceContext,
          ),
      );
      for (const file of files) {
        const kind = reviewFileKind(file);
        const token = JSON.stringify([file.filePath, file.rawDiff]);
        if (
          mounted.has(file.filePath) &&
          !file.pending &&
          !file.sourceContext &&
          file.coverage === "partial" &&
          ["unity_scene", "unity_prefab", "unity_asset"].includes(kind) &&
          ["modified", "renamed"].includes(file.status) &&
          file.rawDiff &&
          !attempted.has(token) &&
          !queue.some(
            (item) => item.file.filePath === file.filePath && item.file.rawDiff === file.rawDiff,
          )
        ) {
          // Validate before queueing; never fall back to HEAD for context.
          try {
            unityBlobUrl(
              navigation.repositoryUrl,
              navigation.beforeRevision,
              file.previousPath ?? file.filePath,
            );
            unityBlobUrl(navigation.repositoryUrl, navigation.afterRevision, file.filePath);
          } catch {
            continue;
          }
          queue.push({ file, navigation });
        }
      }
      pump();
    },
  };
}
