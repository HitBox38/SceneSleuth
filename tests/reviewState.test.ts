import assert from "node:assert/strict";
import { test } from "node:test";
import { createReviewState } from "../content_script/scripts/reviewState.ts";
import { unityReview, imageGuid } from "./fixtures/unity.ts";
import { referenceFilePath } from "../shared/referenceLinks.ts";

const navigation = {
  repositoryUrl: "https://github.com/example/game",
  changesUrl: "https://github.com/example/game/pull/1/changes",
  beforeRevision: "a".repeat(40),
  afterRevision: "b".repeat(40),
  files: [{ path: "Assets/light.png.meta", status: "added" as const }],
};
const pending = { ...unityReview, rawDiff: "", changes: [], pending: true };
test("virtualized metadata retains GUID names after its table leaves the viewport", () => {
  const state = createReviewState();
  state.merge({ comparisonKey: "one", files: [pending], navigation });
  state.merge({
    comparisonKey: "one",
    files: [unityReview],
    navigation: { ...navigation, files: [{ ...navigation.files[0], unityGuidAfter: imageGuid }] },
  });
  const returned = state.merge({ comparisonKey: "one", files: [pending], navigation });
  const ref = unityReview.changes[3].properties.find((p) => p.name === "m_Sprite")!
    .afterReferences![0];
  assert.equal(returned.files[0].pending, undefined);
  assert.equal(
    referenceFilePath(ref, unityReview, "after", returned.navigation!),
    "Assets/light.png",
  );
});
test("comparison changes and explicit metadata invalidations cannot reuse previous GUID evidence", () => {
  const state = createReviewState();
  const loaded = {
    comparisonKey: "one",
    files: [unityReview],
    navigation: { ...navigation, files: [{ ...navigation.files[0], unityGuidAfter: imageGuid }] },
  };
  state.merge(loaded);
  const invalid = state.merge({
    ...loaded,
    navigation: { ...navigation, files: [{ ...navigation.files[0], unityGuidAfter: null }] },
  });
  assert.equal(invalid.navigation!.files[0].unityGuidAfter, null);
  state.merge(loaded);
  assert.equal(
    state.merge({ comparisonKey: "two", files: [pending], navigation }).navigation!.files[0]
      .unityGuidAfter,
    undefined,
  );
  state.clear();
  assert.equal(
    state.merge({ comparisonKey: "one", files: [pending], navigation }).files[0].pending,
    true,
  );
});

test("temporary DOM-only frames retain an authoritative listing, revisions and renamed metadata paths", () => {
  const state = createReviewState();
  const first = state.merge({
    comparisonKey: "known",
    files: [unityReview, pending],
    navigation: {
      ...navigation,
      files: [
        { ...navigation.files[0], previousPath: "Assets/old.png.meta", unityGuidAfter: imageGuid },
      ],
    },
  });
  const frame = state.merge({
    comparisonKey: "rendered:current",
    partialListing: true,
    files: [],
    navigation: {
      ...navigation,
      beforeRevision: undefined,
      afterRevision: undefined,
      files: [{ ...navigation.files[0], previousPath: undefined }],
    },
  });
  assert.equal(frame.comparisonKey, first.comparisonKey);
  assert.equal(frame.partialListing, false);
  assert.equal(frame.navigation!.afterRevision, navigation.afterRevision);
  assert.equal(frame.navigation!.files[0].previousPath, "Assets/old.png.meta");
  assert.equal(frame.navigation!.files[0].unityGuidAfter, imageGuid);
  assert.ok(state.current);
});

test("a DOM-only hunk cannot downgrade a complete preloaded added file", () => {
  const state = createReviewState();
  state.merge({ comparisonKey: "known", files: [unityReview] });
  const returned = state.merge({
    comparisonKey: "rendered",
    partialListing: true,
    files: [
      {
        ...unityReview,
        coverage: "partial",
        status: "modified",
        rawDiff: unityReview.rawDiff + "longer DOM headers",
      },
    ],
  });
  assert.equal(returned.files[0].coverage, "complete");
  assert.equal(returned.files[0].status, "added");
});
