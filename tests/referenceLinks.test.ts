import test from "node:test";
import assert from "node:assert/strict";
import type { ReferenceNavigation, ValueReference } from "../shared/model.ts";
import {
  navigationContext,
  referencedFilePath,
  referenceLink,
  referenceImageSource,
} from "../shared/referenceLinks.ts";
import { referencedSceneReview } from "./fixtures/file-contents.ts";
import { reviewGithubData } from "../content_script/scripts/githubReview.ts";

const url = "https://github.com/example/game/pull/7/changes?w=1";
const base = "a".repeat(40),
  head = "b".repeat(40);
const navigation: ReferenceNavigation = {
  ...navigationContext(url)!,
  beforeRevision: base,
  afterRevision: head,
};
const reference = (resourcePath: string): ValueReference => ({
  start: 0,
  end: 16,
  label: "target",
  target: resourcePath,
  resourcePath,
  className: "Script",
});

test("all PR file types, including lazy scripts and binary assets, are navigation targets", () => {
  const data = reviewGithubData(
    {
      payload: {
        pullRequestsChangesRoute: {
          comparison: { fullDiff: { baseOid: base, headOid: head } },
          diffSummaries: [
            { path: "Scenes/lamp.tscn", pathDigest: "scene", changeType: "MODIFIED" },
            { path: "Scripts/light_controller.gd", pathDigest: "script", changeType: "ADDED" },
            { path: "Assets/light.png", pathDigest: "texture", changeType: "MODIFIED" },
          ],
          diffContents: [],
        },
      },
    },
    url,
  )!;
  assert.equal(data.files.length, 1);
  assert.equal(data.navigation?.files.length, 3);
  for (const [path, digest] of [
    ["Scripts/light_controller.gd", "script"],
    ["Assets/light.png", "texture"],
  ]) {
    assert.deepEqual(
      referenceLink(reference(`res://${path}`), referencedSceneReview, "after", data.navigation),
      { href: `${url}#diff-${digest}`, inReview: true },
    );
  }
});

test("unmodified files open in the repository at the corresponding before/after commit", () => {
  const ref = reference("res://Assets/a space/#icon?雪%.png");
  for (const [side, revision] of [
    ["before", base],
    ["after", head],
  ] as const) {
    assert.deepEqual(referenceLink(ref, referencedSceneReview, side, navigation), {
      href: `https://github.com/example/game/blob/${revision}/Assets/a%20space/%23icon%3F%E9%9B%AA%25.png`,
      inReview: false,
    });
  }
});

test("renamed scene-relative paths use each version's directory and renamed targets share their PR diff", () => {
  const file = {
    ...referencedSceneReview,
    filePath: "New/lamp.tscn",
    previousPath: "Old/lamp.tscn",
  };
  const nav = {
    ...navigation,
    files: [
      {
        path: "New/light.gd",
        previousPath: "Old/light.gd",
        status: "renamed" as const,
        reviewUrl: `${url}#diff-renamed`,
      },
    ],
  };
  for (const side of ["before", "after"] as const) {
    assert.equal(
      referenceLink(reference("light.gd"), file, side, nav)?.href,
      `${url}#diff-renamed`,
    );
  }
  assert.equal(
    referenceLink(reference("other.gd"), file, "before", nav)?.href,
    `https://github.com/example/game/blob/${base}/Old/other.gd`,
  );
  assert.equal(
    referenceLink(reference("other.gd"), file, "after", nav)?.href,
    `https://github.com/example/game/blob/${head}/New/other.gd`,
  );
});

test("added/deleted files and duplicate basenames are matched by exact versioned paths", () => {
  const nav: ReferenceNavigation = {
    ...navigation,
    files: [
      { path: "Old/light.gd", status: "removed", reviewUrl: `${url}#diff-deleted` },
      { path: "New/light.gd", status: "added", reviewUrl: `${url}#diff-added` },
    ],
  };
  assert.equal(
    referenceLink(reference("res://Old/light.gd"), referencedSceneReview, "before", nav)?.href,
    `${url}#diff-deleted`,
  );
  assert.equal(
    referenceLink(reference("res://New/light.gd"), referencedSceneReview, "after", nav)?.href,
    `${url}#diff-added`,
  );
  assert.equal(
    referenceLink(reference("res://Old/light.gd"), referencedSceneReview, "after", nav)?.inReview,
    true,
  );
  assert.equal(
    referenceLink(reference("res://New/light.gd"), referencedSceneReview, "before", nav)?.inReview,
    true,
  );
});

test("selected comparison revisions override full-PR revisions and per-file commits cover range routes", () => {
  const route = {
    comparison: {
      fullDiff: { baseOid: base, headOid: head },
      selectedRange: { baseOid: "c".repeat(40), headOid: "d".repeat(40) },
    },
    diffSummaries: [],
    diffContents: [{ oldCommitOid: "e".repeat(40), newCommitOid: "f".repeat(40) }],
  };
  const read = () =>
    reviewGithubData(
      { payload: { pullRequestsChangesWithRangeRoute: route } },
      "https://github.com/example/game/pull/7/changes/commit",
    )!.navigation!;
  assert.equal(read().beforeRevision, "c".repeat(40));
  assert.equal(read().afterRevision, "d".repeat(40));
  // An omitted range object is represented by null in real GitHub payloads.
  const withoutSelection = {
    ...route,
    comparison: { fullDiff: route.comparison.fullDiff, selectedRange: null },
  };
  const fallback = reviewGithubData(
    { payload: { pullRequestsChangesWithRangeRoute: withoutSelection } },
    "https://github.com/example/game/pull/7/changes/commit",
  )!.navigation!;
  assert.equal(fallback.beforeRevision, "e".repeat(40));
  assert.equal(fallback.afterRevision, "f".repeat(40));
  const unknown = reviewGithubData(
    { payload: { pullRequestsChangesWithRangeRoute: { ...withoutSelection, diffContents: [] } } },
    "https://github.com/example/game/pull/7/changes/commit",
  )!.navigation!;
  assert.equal(unknown.afterRevision, undefined);
  assert.ok(
    referenceLink(
      reference("res://light.png"),
      referencedSceneReview,
      "after",
      unknown,
    )?.href.includes("/blob/HEAD/"),
  );
});

test("resource paths are normalized and cannot navigate outside repository files", () => {
  assert.equal(referencedFilePath("../Assets/light.png", "Scenes/lamp.tscn"), "Assets/light.png");
  assert.equal(referencedFilePath("res://Assets/../light.png", "Scenes/lamp.tscn"), "light.png");
  for (const path of [
    "javascript:alert(1)",
    "data:text/html,bad",
    "https://evil.example/a",
    "user://save",
    "uid://thing",
    "//evil.example/a",
    "/absolute",
    "res://../escape",
    "../../escape",
    "res://bad\\path",
    "res://bad\npath",
    "res://",
  ]) {
    assert.equal(
      referenceLink(reference(path), referencedSceneReview, "after", navigation),
      undefined,
      path,
    );
  }
  assert.equal(
    referenceLink(
      { ...reference("res://node"), resourcePath: undefined },
      referencedSceneReview,
      "after",
      navigation,
    ),
    undefined,
  );
  assert.equal(referenceLink(reference("res://a"), referencedSceneReview, "after"), undefined);
});

test("unsafe or stale diff destinations fall back to the repository and missing revisions use HEAD", () => {
  for (const reviewUrl of [
    "javascript:alert(1)",
    "https://evil.example/#diff-other",
    "https://github.com/example/game/pull/99/changes#diff-other",
    "http://[",
  ]) {
    const nav = {
      ...navigation,
      files: [{ path: "light.gd", status: "modified" as const, reviewUrl }],
    };
    assert.equal(
      referenceLink(reference("res://light.gd"), referencedSceneReview, "after", nav)?.inReview,
      false,
    );
  }
  assert.equal(navigationContext("http://["), undefined);
  assert.equal(navigationContext("https://evil.example/owner/repo/pull/1/changes"), undefined);
  assert.ok(
    referenceLink(reference("res://light.gd"), referencedSceneReview, "after", {
      ...navigation,
      afterRevision: undefined,
    })?.href.includes("/blob/HEAD/light.gd"),
  );
});

test("image previews use raw bytes at each side's revision even when clicks jump into the PR", () => {
  const ref = reference("res://Assets/a space/雪.PNG");
  const nav: ReferenceNavigation = {
    ...navigation,
    files: [{ path: "Assets/a space/雪.PNG", status: "modified", reviewUrl: `${url}#diff-image` }],
  };
  assert.equal(referenceLink(ref, referencedSceneReview, "after", nav)?.inReview, true);
  assert.equal(
    referenceImageSource(ref, referencedSceneReview, "before", nav),
    `https://github.com/example/game/raw/${base}/Assets/a%20space/%E9%9B%AA.PNG`,
  );
  assert.equal(
    referenceImageSource(ref, referencedSceneReview, "after", nav),
    `https://github.com/example/game/raw/${head}/Assets/a%20space/%E9%9B%AA.PNG`,
  );
});

test("only supported image files get previews; constructors and untrusted URLs never do", () => {
  for (const extension of [
    "png",
    "apng",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "svg",
    "avif",
    "bmp",
    "ico",
  ]) {
    assert.ok(
      referenceImageSource(
        reference(`res://image.${extension}`),
        referencedSceneReview,
        "after",
        navigation,
      ),
    );
  }
  for (const path of [
    "res://scene.tscn",
    "res://script.gd",
    "res://image.png.import",
    "res://image.tga",
    "https://evil.example/image.png",
    "javascript:image.png",
    "res://../image.png",
  ]) {
    assert.equal(
      referenceImageSource(reference(path), referencedSceneReview, "after", navigation),
      undefined,
    );
  }
  assert.equal(
    referenceImageSource(
      { ...reference("res://node.png"), resourcePath: undefined },
      referencedSceneReview,
      "after",
      navigation,
    ),
    undefined,
  );
  assert.equal(
    referenceImageSource(reference("res://image.png"), referencedSceneReview, "after"),
    undefined,
  );
});

test("image previews retain renamed scene-relative paths and the documented HEAD fallback", () => {
  const file = {
    ...referencedSceneReview,
    filePath: "New/scene.tscn",
    previousPath: "Old/scene.tscn",
  };
  assert.equal(
    referenceImageSource(reference("image.svg"), file, "before", navigation),
    `https://github.com/example/game/raw/${base}/Old/image.svg`,
  );
  assert.equal(
    referenceImageSource(reference("image.svg"), file, "after", navigation),
    `https://github.com/example/game/raw/${head}/New/image.svg`,
  );
  assert.equal(
    referenceImageSource(reference("image.svg"), file, "after", {
      ...navigation,
      afterRevision: undefined,
    }),
    "https://github.com/example/game/raw/HEAD/New/image.svg",
  );
  assert.equal(
    referenceImageSource(reference("image.svg"), file, "after", {
      ...navigation,
      repositoryUrl: "https://evil.example/repo",
    }),
    undefined,
  );
});
