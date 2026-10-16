import test from "node:test";
import assert from "node:assert/strict";
import { reviewGithubData } from "../content_script/scripts/githubReview.ts";
const url = "https://github.com/example/game/pull/7/changes";
function payload(diffSummaries: unknown[], diffContents: unknown[]) {
  return {
    payload: {
      pullRequestsChangesRoute: {
        comparison: { fullDiff: { baseOid: "base", headOid: "head" } },
        diffSummaries,
        diffContents,
      },
    },
  };
}
test("GitHub data yields structured scenes, skips other files and tracks unloaded diffs", () => {
  const result = reviewGithubData(
    payload(
      [
        { path: "new.tscn", changeType: "ADDED", pathDigest: "one", linesAdded: 2 },
        {
          path: "main.tscn",
          changeType: "MODIFIED",
          pathDigest: "two",
          linesAdded: 4,
          linesDeleted: 1,
        },
        { path: "script.gd", changeType: "ADDED" },
      ],
      [
        {
          path: "new.tscn",
          diffLines: [
            { type: "HUNK", text: "@@ -0,0 +1,2 @@" },
            {
              type: "ADDITION",
              text: '+[node name="Player" type="Node2D"]',
              html: '<img src=x onerror="throw 1">',
            },
            { type: "ADDITION", text: "+position = Vector2(1, 2)" },
          ],
        },
      ],
    ),
    url,
  )!;
  assert.equal(result.files.length, 2);
  const [loaded, pending] = result.files;
  assert.equal(loaded.coverage, "complete");
  assert.equal(loaded.changes[0].label, "Player");
  assert.equal(
    loaded.changes[0].properties.find((p) => p.name === "position")?.after,
    "Vector2(1, 2)",
  );
  assert.equal(loaded.rawDiff.includes("onerror"), false);
  assert.equal(pending.pending, true);
  assert.equal(pending.changes.length, 0);
  assert.equal(pending.additions, 4);
  assert.equal(pending.reviewUrl, `${url}#diff-two`);
});
test("GitHub context lines retain ownership and a real before/after change", () => {
  const result = reviewGithubData(
    payload(
      [{ path: "scene.tscn", changeType: "MODIFIED" }],
      [
        {
          path: "scene.tscn",
          diffLines: [
            { type: "HUNK", text: "@@ -10,2 +10,2 @@" },
            { type: "CONTEXT", text: '[node name="Player" type="Node2D"]' },
            { type: "DELETION", text: "-health = 2" },
            { type: "ADDITION", text: "+health = 3" },
          ],
        },
      ],
    ),
    url,
  )!;
  const change = result.files[0].changes[0];
  assert.equal(change.label, "Player");
  assert.equal(change.operation, "modified");
  assert.deepEqual(
    change.properties.map((p) => [p.before, p.after, p.oldLine, p.newLine]),
    [["2", "3", 11, 11]],
  );
});
test("empty and unsupported GitHub payloads are different states", () => {
  assert.deepEqual(reviewGithubData(payload([], []), url)?.files, []);
  assert.equal(reviewGithubData({ payload: {} }, url), undefined);
  assert.equal(reviewGithubData(null, url), undefined);
});
test("comparison identity changes when the selected commit range changes", () => {
  const initial = payload([], []);
  const first = reviewGithubData(initial, url)?.comparisonKey;
  initial.payload.pullRequestsChangesRoute.comparison.fullDiff.headOid = "new-head";
  assert.notEqual(reviewGithubData(initial, url)?.comparisonKey, first);
});
test("rename-only scenes preserve their old path without claiming unloaded text", () => {
  const [file] = reviewGithubData(
    payload(
      [{ path: "renamed.tscn", changeType: "RENAMED", linesAdded: 0, linesDeleted: 0 }],
      [{ path: "renamed.tscn", oldTreeEntry: { path: "old.tscn" }, diffLines: [] }],
    ),
    url,
  )!.files;
  assert.equal(file.status, "renamed");
  assert.equal(file.previousPath, "old.tscn");
  assert.equal(file.pending, undefined);
  assert.equal(file.coverage, "partial");
});
test("GitHub-limited diffs stay partial even for newly added scenes", () => {
  const [file] = reviewGithubData(
    payload(
      [{ path: "new.tscn", changeType: "ADDED", linesAdded: 1 }],
      [
        {
          path: "new.tscn",
          isTooBig: true,
          diffLines: [
            { type: "HUNK", text: "@@ -0,0 +1 @@" },
            { type: "ADDITION", text: '+[node name="Root"]' },
          ],
        },
      ],
    ),
    url,
  )!.files;
  assert.equal(file.coverage, "partial");
  assert.ok(file.diagnostics.some((note) => note.includes("limited")));
});

test("commit-range routes use their own scene snapshot", () => {
  const full = payload([{ path: "full.tscn", changeType: "MODIFIED" }], []);
  const range = {
    payload: {
      pullRequestsChangesWithRangeRoute: {
        ...full.payload.pullRequestsChangesRoute,
        comparison: {
          fullDiff: { baseOid: "base", headOid: "head" },
          selectedRange: { baseOid: "base", headOid: "earlier" },
        },
        diffSummaries: [{ path: "earlier.tscn", changeType: "MODIFIED" }],
      },
    },
  };
  const review = reviewGithubData(range, `${url}/earlier`)!;
  assert.deepEqual(
    review.files.map((f) => f.filePath),
    ["earlier.tscn"],
  );
  assert.notEqual(review.comparisonKey, reviewGithubData(full, url)?.comparisonKey);
  assert.ok(review.files[0].reviewUrl?.startsWith(`${url}/earlier#`));
});
