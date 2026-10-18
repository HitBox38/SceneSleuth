import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import {
  githubBatchUrl,
  githubBatchReview,
  githubResponseText,
  createGithubLoader,
} from "../content_script/scripts/githubLoader.ts";
import { reviewGithubData } from "../content_script/scripts/githubReview.ts";
import { createReviewState } from "../content_script/scripts/reviewState.ts";

const url = "https://github.com/example/game/pull/1/changes";
const base = "a".repeat(40),
  head = "b".repeat(40);
function fixture(count = 1) {
  const summaries = Array.from({ length: count }, (_, i) => ({
    path: `Scenes/Scene ${i}.tscn`,
    pathDigest: `scene-${i}`,
    changeType: "ADDED",
    linesAdded: 2,
  }));
  const data = reviewGithubData(
    {
      payload: {
        pullRequestsChangesRoute: {
          comparison: { fullDiff: { baseOid: base, headOid: head } },
          diffSummaries: summaries,
          diffContents: [],
        },
      },
    },
    url,
  )!;
  return { data, source: data.loadSource! };
}
function contents(paths: string[]) {
  return paths.map((path) => ({
    path,
    oldCommitOid: base,
    newCommitOid: head,
    diffLines: [
      { type: "HUNK", text: "@@ -0,0 +1,2 @@" },
      { type: "ADDITION", text: `+[node name="${path}" type="Node2D"]` },
      { type: "ADDITION", text: "+position = Vector2(1, 2)" },
    ],
  }));
}

test("native batch URLs encode each filename and pin the selected comparison and whitespace mode", () => {
  const { source } = fixture();
  const paths = ["Scenes/a,b %.tscn", "Assets/a#b.asset"];
  const request = new URL(
    githubBatchUrl({ ...source, hideWhitespace: true, baseOid: "c".repeat(40) }, paths),
  );
  assert.equal(request.origin, "https://github.com");
  assert.equal(request.pathname, "/example/game/pull/1/page_data/diff_entries");
  assert.deepEqual(request.searchParams.get("paths")!.split(",").map(decodeURIComponent), paths);
  assert.equal(request.searchParams.get("range"), `${"c".repeat(40)}..${head}`);
  assert.equal(request.searchParams.get("w"), "1");
  assert.equal(new URL(githubBatchUrl(source, paths)).searchParams.get("range"), head);
  assert.throws(() =>
    githubBatchUrl(
      { ...source, changesUrl: "https://other.example/example/game/pull/1/changes" },
      paths,
    ),
  );
});

test("batch responses use the same hunk adapter and reject stale commit IDs and unrelated paths", () => {
  const { source } = fixture();
  const path = String(source.summaries[0].path);
  const data = githubBatchReview(source, [path], contents([path, "other.tscn"]));
  assert.equal(data.files.length, 1);
  assert.equal(data.files[0].coverage, "complete");
  assert.equal(
    data.files[0].changes[0].properties.find((p) => p.name === "position")?.after,
    "Vector2(1, 2)",
  );
  assert.equal(data.files[0].reviewUrl, `${url}#diff-scene-0`);
  assert.equal(data.comparisonKey, source.comparisonKey);
  assert.throws(
    () => githubBatchReview(source, [path], [{ ...contents([path])[0], newCommitOid: base }]),
    /changed/,
  );
  assert.throws(() => githubBatchReview(source, [path], { html: "login" }), /unsupported/);
});

test("GitHub response reading is bounded even without Content-Length", async () => {
  assert.equal(await githubResponseText(new Response("hello"), 5), "hello");
  await assert.rejects(githubResponseText(new Response("too long"), 5), /limit/);
  await assert.rejects(
    githubResponseText(new Response("x", { headers: { "content-length": "100" } }), 5),
    /limit/,
  );
  await assert.rejects(
    githubResponseText(new Response("login", { status: 403 })),
    /could not load/,
  );
});

test("off-screen diffs load in deduplicated batches with at most two requests at a time", async () => {
  const { data } = fixture(12),
    state = createReviewState();
  const requests: { paths: string[]; resolve: (response: Response) => void }[] = [];
  const progress: number[] = [];
  const loader = createGithubLoader({
    onData(loaded) {
      state.merge(loaded);
      loader.update(state.current!, url);
    },
    onProgress: (n) => progress.push(n),
    fetch: async (input, init) => {
      assert.equal(init?.credentials, "same-origin");
      assert.equal(init?.redirect, "error");
      assert.equal(new Headers(init?.headers).get("X-Requested-With"), "XMLHttpRequest");
      const paths = new URL(String(input)).searchParams
        .get("paths")!
        .split(",")
        .map(decodeURIComponent);
      return new Promise<Response>((resolve) => requests.push({ paths, resolve }));
    },
  });
  loader.update(state.merge(data), url);
  loader.update(state.current!, url);
  assert.equal(requests.length, 2);
  assert.equal(loader.remaining, 12);
  requests[0].resolve(Response.json(contents(requests[0].paths)));
  await setImmediate();
  assert.equal(requests.length, 3);
  assert.equal(loader.remaining, 8);
  assert.equal(state.current!.files.filter((f) => !f.pending).length, 4);
  requests[1].resolve(Response.json(contents(requests[1].paths)));
  requests[2].resolve(Response.json(contents(requests[2].paths)));
  await setImmediate();
  assert.equal(state.current!.files.filter((f) => !f.pending).length, 12);
  assert.equal(loader.remaining, 0);
  assert.equal(progress.at(-1), 0);
  loader.update(state.current!, url);
  assert.equal(requests.length, 3);
  loader.clear();
});

test("navigation aborts in-flight requests and ignores late results; failed loads retry only after refresh", async () => {
  const { data } = fixture();
  let loaded = 0,
    requests = 0;
  let finish: ((response: Response) => void) | undefined;
  let signal: AbortSignal | undefined;
  const loader = createGithubLoader({
    onData: () => loaded++,
    onProgress: () => {},
    fetch: async (_url, init) => {
      requests++;
      signal = init?.signal ?? undefined;
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    },
  });
  loader.update(data, url);
  loader.clear();
  assert.equal(signal?.aborted, true);
  finish!(Response.json(contents([data.files[0].filePath])));
  await setImmediate();
  assert.equal(loaded, 0);
  loader.update(data, url);
  finish!(new Response("denied", { status: 403 }));
  await setImmediate();
  loader.update(data, url);
  assert.equal(requests, 2);
  assert.equal(loader.remaining, 0);
  assert.equal(loader.failed, true);
  loader.clear();
  assert.equal(loader.failed, false);
  loader.update(data, url);
  assert.equal(requests, 3);
  loader.clear();
  finish!(new Response("cancelled"));
  await setImmediate();
});

test("bootstrap runs once per route and discards responses from a previous page", async () => {
  const data = { comparisonKey: "rendered", files: [], partialListing: true };
  let loaded = 0;
  const resolvers: ((data: ReturnType<typeof fixture>["data"]) => void)[] = [];
  const loader = createGithubLoader({
    onData: () => loaded++,
    onProgress: () => {},
    bootstrap: async () => new Promise((resolve) => resolvers.push(resolve)),
  });
  loader.update(data, url);
  loader.update(data, url);
  assert.equal(resolvers.length, 1);
  const nextUrl = url.replace("/1/", "/2/");
  loader.update(data, nextUrl);
  resolvers[0](fixture().data);
  await setImmediate();
  assert.equal(loaded, 0);
  const current = fixture().data;
  resolvers[1]({ ...current, loadSource: { ...current.loadSource!, changesUrl: nextUrl } });
  await setImmediate();
  assert.equal(loaded, 1);
  loader.clear();
});

test("generated files remain behind GitHub's explicit Load Diff control", async () => {
  const { source } = fixture();
  const path = String(source.summaries[0].path);
  const data = githubBatchReview(
    source,
    [path],
    [
      {
        path,
        oldCommitOid: base,
        newCommitOid: head,
        newTreeEntry: { path, isGenerated: true },
        diffLines: [],
      },
    ],
  );
  assert.equal(data.files[0].pending, true);
  assert.equal(data.files[0].pendingReason, "generated");
  let requests = 0;
  const loader = createGithubLoader({
    onData: () => {},
    onProgress: () => {},
    fetch: async () => {
      requests++;
      return Response.json([]);
    },
  });
  loader.update(data, url);
  await setImmediate();
  assert.equal(requests, 0);
  loader.clear();
});
