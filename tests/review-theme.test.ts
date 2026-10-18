import assert from "node:assert/strict";
import { test } from "node:test";
import { repositoryTheme, reviewTheme } from "../shared/reviewTheme.ts";
import {
  repositoryTreeTheme,
  createRepositoryThemeLoader,
} from "../content_script/scripts/repositoryTheme.ts";
import { unityReview } from "./fixtures/unity.ts";
import type { ReviewSnapshot } from "../shared/model.ts";
import { isReviewSnapshot } from "../shared/protocol.ts";

const revision = "a".repeat(40);
const navigation = {
  repositoryUrl: "https://github.com/example/game",
  changesUrl: "https://github.com/example/game/pull/1/changes",
  afterRevision: revision,
  files: [],
};
const godot = { ...unityReview, filePath: "Scenes/Player.tscn" };
const snapshot: ReviewSnapshot = {
  reviewKey: "one",
  title: "test",
  status: "ready",
  files: [unityReview],
  navigation,
};
const items = (engine: string) =>
  engine === "unity"
    ? [
        { path: "Assets", contentType: "directory" },
        { path: "ProjectSettings", contentType: "directory" },
      ]
    : [{ path: "project.godot", contentType: "file" }];
const tree = (engine: string) => ({
  payload: {
    codeViewTreeRoute: {
      path: "",
      refInfo: { currentOid: revision },
      tree: { items: items(engine) },
    },
  },
});
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("repository context wins over changed file type and unknown reviews stay GitHub-neutral", () => {
  assert.equal(repositoryTheme(snapshot), "unity");
  assert.equal(reviewTheme({ ...snapshot, repositoryTheme: "godot" }, unityReview), "godot");
  assert.equal(
    reviewTheme({ ...snapshot, files: [godot], repositoryTheme: "unity" }, godot),
    "unity",
  );
  assert.equal(reviewTheme({ ...snapshot, files: [] }), "github");
  assert.equal(reviewTheme({ ...snapshot, files: [], repositoryTheme: "unity" }), "unity");
  assert.equal(reviewTheme({ ...snapshot, files: [godot] }), "godot");
});

test("pending and offscreen file paths establish engine identity; mixed projects theme each file", () => {
  const mixed = {
    ...snapshot,
    files: [godot],
    navigation: {
      ...navigation,
      files: [
        { path: "Samples/Unity/ProjectSettings/ProjectVersion.txt", status: "modified" as const },
      ],
    },
  };
  assert.equal(repositoryTheme(mixed), "mixed");
  assert.equal(reviewTheme(mixed), "github");
  assert.equal(reviewTheme(mixed, unityReview), "unity");
  assert.equal(reviewTheme(mixed, godot), "godot");
  assert.equal(
    reviewTheme({
      ...snapshot,
      files: [],
      navigation: { ...navigation, files: [{ path: "Game/project.godot", status: "modified" }] },
    }),
    "godot",
  );
  assert.equal(reviewTheme({ ...snapshot, files: [{ ...godot, pending: true }] }), "godot");
});

test("root-tree detection validates revision, completeness, marker types and mixed roots", () => {
  assert.equal(repositoryTreeTheme(tree("unity"), revision), "unity");
  const slashRoot = tree("unity");
  slashRoot.payload.codeViewTreeRoute.path = "/";
  assert.equal(repositoryTreeTheme(slashRoot, revision), "unity");
  assert.equal(repositoryTreeTheme(tree("godot"), revision), "godot");
  const mixed = tree("unity");
  mixed.payload.codeViewTreeRoute.tree.items.push(...items("godot"));
  assert.equal(repositoryTreeTheme(mixed, revision), "mixed");
  assert.throws(() => repositoryTreeTheme(tree("unity"), "b".repeat(40)));
  assert.throws(() =>
    repositoryTreeTheme(
      {
        payload: {
          ...tree("unity").payload,
          codeViewTreeRoute: { ...tree("unity").payload.codeViewTreeRoute, path: "unrelated" },
        },
      },
      revision,
    ),
  );
  assert.throws(() =>
    repositoryTreeTheme(
      {
        payload: {
          codeViewTreeRoute: {
            path: "",
            refInfo: { currentOid: revision },
            tree: { items: [], totalCount: 200 },
          },
        },
      },
      revision,
    ),
  );
  assert.equal(
    repositoryTreeTheme(
      {
        payload: {
          codeViewTreeRoute: {
            path: "",
            refInfo: { currentOid: revision },
            tree: { items: [{ path: "project.godot", contentType: "directory" }] },
          },
        },
      },
      revision,
    ),
    "github",
  );
});

test("repository theme loader performs one bounded same-origin lookup and rejects late navigation", async () => {
  const results: string[] = [];
  const requests: { url: string; signal: AbortSignal }[] = [];
  const pending: ((r: Response) => void)[] = [];
  const loader = createRepositoryThemeLoader({
    onTheme: (t) => results.push(t),
    readData: JSON.parse,
    fetch: (input, init) => {
      assert.equal(init?.credentials, "same-origin");
      assert.equal(init?.redirect, "error");
      requests.push({ url: String(input), signal: init!.signal! });
      return new Promise((resolve) => pending.push(resolve));
    },
  });
  loader.update("one", navigation);
  loader.update("one", navigation);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `${navigation.repositoryUrl}/tree/${revision}`);
  loader.update("two", navigation);
  assert.equal(requests[0].signal.aborted, true);
  pending[0](Response.json(tree("godot")));
  await tick();
  assert.deepEqual(results, []);
  pending[1](Response.json(tree("unity")));
  await tick();
  assert.deepEqual(results, ["unity"]);
  loader.update("two", navigation);
  assert.equal(requests.length, 2);
  loader.update("pending", navigation);
  loader.update("new-route", undefined);
  assert.equal(requests[2].signal.aborted, true);
  pending[2](Response.json(tree("godot")));
  await tick();
  assert.deepEqual(results, ["unity"]);
  loader.clear();
  loader.update("three", { ...navigation, afterRevision: "HEAD" });
  assert.equal(requests.length, 3);
  loader.update("three", { ...navigation, repositoryUrl: "https://evil.example/game" });
  assert.equal(requests.length, 3);
  loader.clear();
});

test("snapshot messages accept only supported theme and appearance values", () => {
  assert.equal(
    isReviewSnapshot({ ...snapshot, repositoryTheme: "unity", colorMode: "light" }),
    true,
  );
  assert.equal(isReviewSnapshot({ ...snapshot, repositoryTheme: "injected" }), false);
  assert.equal(isReviewSnapshot({ ...snapshot, colorMode: "auto" }), false);
});
