import { reviewContext } from "../../shared/protocol.ts";
import { reviewGithubData, type GithubLoadSource } from "./githubReview.ts";
import type { GithubReviewData } from "./reviewState.ts";

export const githubJsonHeaders = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "GitHub-Is-React": "true",
  "GitHub-Verified-Fetch": "true",
  "X-Requested-With": "XMLHttpRequest",
};

// Mirrors the native Files changed request: each path is encoded before the
// list is encoded as a query value. Commas/percent signs in filenames stay data.
export function githubBatchUrl(source: GithubLoadSource, paths: string[]): string {
  const context = reviewContext(source.changesUrl);
  if (!context?.isChangesPage || !paths.length || paths.length > 4)
    throw new Error("Invalid diff batch.");
  const params = new URLSearchParams({
    paths: paths.map((path) => encodeURIComponent(path)).join(","),
    w: source.hideWhitespace ? "1" : "0",
    range:
      source.baseOid === source.fullBaseOid
        ? source.headOid
        : `${source.baseOid}..${source.headOid}`,
  });
  return `https://github.com${context.key}/page_data/diff_entries?${params}`;
}

// Check streamed byte counts as well as Content-Length. Large responses stay
// pending for GitHub's native loader instead of consuming unbounded memory.
export async function githubResponseText(response: Response, limit = 8_000_000): Promise<string> {
  if (!response.ok || Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new Error("GitHub could not load this diff within the review limit.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("GitHub returned no diff text.");
  const decoder = new TextDecoder();
  let bytes = 0,
    text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new Error("GitHub diff response exceeded the review limit.");
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export function githubBatchReview(
  source: GithubLoadSource,
  paths: string[],
  value: unknown,
): GithubReviewData {
  if (!Array.isArray(value)) throw new Error("GitHub returned an unsupported diff response.");
  const allowed = new Set(paths);
  const entries: unknown[] = value;
  const contents = entries.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    return typeof entry.path === "string" && allowed.has(entry.path) ? [entry] : [];
  });
  for (const item of contents) {
    // Reject stale responses rather than naming a file from another comparison.
    if (
      (item.newCommitOid && item.newCommitOid !== source.headOid) ||
      (item.oldCommitOid && item.oldCommitOid !== source.baseOid)
    )
      throw new Error("The GitHub comparison changed while loading.");
  }
  const review = reviewGithubData(
    {
      payload: {
        pullRequestsChangesRoute: {
          comparison: {
            fullDiff: { baseOid: source.fullBaseOid, headOid: source.headOid },
            selectedRange: { baseOid: source.baseOid, headOid: source.headOid },
          },
          diffSummaries: source.summaries.filter(
            (item) => typeof item.path === "string" && allowed.has(item.path),
          ),
          diffContents: contents,
        },
      },
    },
    source.changesUrl,
  );
  if (!review) throw new Error("GitHub returned an unreadable diff batch.");
  return {
    ...review,
    comparisonKey: source.comparisonKey,
    loadSource: source,
    partialListing: true,
  };
}

interface LoaderOptions {
  onData: (data: GithubReviewData) => void;
  onProgress: (remaining: number) => void;
  bootstrap?: (changesUrl: string, signal: AbortSignal) => Promise<GithubReviewData | undefined>;
  fetch?: typeof fetch;
}
export function createGithubLoader(options: LoaderOptions) {
  let controller = new AbortController();
  let generation = 0,
    key = "",
    active = 0,
    remaining = 0;
  let source: GithubLoadSource | undefined;
  let queue: string[] = [];
  const attempted = new Set<string>();
  let bootstrapAttempted = false;
  let failed = false;
  const request = options.fetch ?? fetch;
  function progress() {
    options.onProgress(remaining);
  }
  function clear() {
    generation++;
    controller.abort();
    controller = new AbortController();
    queue = [];
    attempted.clear();
    source = undefined;
    active = 0;
    remaining = 0;
    key = "";
    bootstrapAttempted = false;
    failed = false;
  }
  function pump() {
    while (source && active < 2 && queue.length) {
      const batch = queue.splice(0, 4),
        current = source,
        run = generation;
      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort(), 15_000);
      const signal = AbortSignal.any([controller.signal, timeout.signal]);
      active++;
      void (async () => {
        try {
          const response = await request(githubBatchUrl(current, batch), {
            headers: githubJsonHeaders,
            credentials: "same-origin",
            redirect: "error",
            signal,
          });
          const data = githubBatchReview(
            current,
            batch,
            JSON.parse(await githubResponseText(response)),
          );
          if (run === generation && !signal.aborted) options.onData(data);
        } catch {
          // Native viewport loading remains available; Refresh allows a retry.
          if (run === generation && !controller.signal.aborted) failed = true;
        } finally {
          clearTimeout(timer);
          if (run === generation) {
            active--;
            remaining -= batch.length;
            progress();
            pump();
          }
        }
      })();
    }
  }
  return {
    clear,
    update(data: GithubReviewData, changesUrl: string) {
      const nextKey = `${changesUrl}:${data.comparisonKey}`;
      if (key !== nextKey) {
        clear();
        key = nextKey;
      }
      source = data.loadSource;
      if (source) {
        // Native diffs that arrived while queued no longer need a request.
        const pending = new Set(
          data.files
            .filter((file) => file.pending && !file.pendingReason)
            .map((file) => file.filePath),
        );
        const kept = queue.filter((path) => pending.has(path));
        remaining -= queue.length - kept.length;
        queue = kept;
        for (const path of pending)
          if (!attempted.has(path)) {
            attempted.add(path);
            queue.push(path);
            remaining++;
          }
        progress();
        pump();
      } else if (!bootstrapAttempted && options.bootstrap && data.partialListing) {
        bootstrapAttempted = true;
        const run = generation;
        void options
          .bootstrap(changesUrl, controller.signal)
          .then((loaded) => {
            if (run !== generation) return;
            if (loaded?.loadSource?.changesUrl === changesUrl) options.onData(loaded);
            else {
              failed = true;
              progress();
            }
          })
          .catch(() => {
            if (run === generation) {
              failed = true;
              progress();
            }
          });
      }
    },
    get failed() {
      return failed;
    },
    get remaining() {
      return remaining;
    },
  };
}
