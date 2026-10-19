import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewDiff } from "../content_script/scripts/diffParser.ts";
import { unityReview, assetReview } from "./fixtures/unity.ts";
import {
  commentAnchor,
  commentAnchorKey,
  reviewCommentTarget,
  propertyCommentTarget,
  sectionCommentTarget,
} from "../shared/reviewComments.ts";

const file = reviewDiff(`diff --git a/player.tscn b/player.tscn
--- a/player.tscn
+++ b/player.tscn
@@ -1,8 +1,8 @@
 [gd_scene format=3]
 [node name="Player" type="Node2D"]
-position = Vector2(1, 2)
+position = Vector2(3, 4)
 metadata/data = {
-"speed": 1,
+"speed": 2,
 "ready": true
 }
 visible = true
`)[0];

test("review threads distinguish before/after anchors and reject malformed lines", () => {
  assert.equal(commentAnchorKey(commentAnchor("left", "3")!), "L3");
  assert.equal(commentAnchorKey(commentAnchor("right", "3")!), "R3");
  for (const [side, line] of [
    ["before", "3"],
    ["right", "0"],
    ["left", "-1"],
    ["left", "3x"],
    ["left", "9007199254740992"],
    [null, "3"],
  ])
    assert.equal(commentAnchor(side, line), undefined);
});

test("comments map to exact section/property ranges, including nested multiline values", () => {
  const node = file.changes.find((change) => change.kind === "node")!;
  for (const side of ["before", "after"] as const) {
    assert.equal(reviewCommentTarget(file, { side, line: 2 }), sectionCommentTarget(node.id));
    assert.equal(
      reviewCommentTarget(file, { side, line: 3 }),
      propertyCommentTarget(node.id, "position"),
    );
    assert.equal(
      reviewCommentTarget(file, { side, line: 5 }),
      propertyCommentTarget(node.id, "metadata/data"),
    );
    assert.equal(
      reviewCommentTarget(file, { side, line: 7 }),
      propertyCommentTarget(node.id, "metadata/data"),
    );
    assert.equal(reviewCommentTarget(file, { side, line: 8 }), undefined);
    assert.equal(reviewCommentTarget(file, { side, line: 90 }), undefined);
  }
});

test("thread placement never borrows another file's property or guesses an omitted side", () => {
  const added = reviewDiff(
    `diff --git a/other.tscn b/other.tscn\nnew file mode 100644\n--- /dev/null\n+++ b/other.tscn\n@@ -0,0 +1,3 @@\n+[gd_scene format=3]\n+[node name="Other" type="Node2D"]\n+scale = Vector2(7, 8)\n`,
  )[0];
  const node = added.changes.find((change) => change.kind === "node")!;
  assert.equal(
    reviewCommentTarget(added, { side: "after", line: 3 }),
    propertyCommentTarget(node.id, "scale"),
  );
  assert.equal(reviewCommentTarget(added, { side: "before", line: 3 }), undefined);
  assert.notEqual(
    reviewCommentTarget(file, { side: "after", line: 3 }),
    reviewCommentTarget(added, { side: "after", line: 3 }),
  );
});

test("Unity component and asset collections retain their own nested comment ranges", () => {
  for (const [review, propertyName, endLine] of [
    [unityReview, "inventory", 25],
    [assetReview, "loot", 12],
  ] as const) {
    const section = review.changes.find((change) =>
      change.properties.some((property) => property.name === propertyName),
    )!;
    assert.equal(
      reviewCommentTarget(review, { side: "after", line: endLine }),
      propertyCommentTarget(section.id, propertyName),
    );
    assert.equal(reviewCommentTarget(review, { side: "before", line: endLine }), undefined);
  }
  assert.equal(
    reviewCommentTarget(unityReview, { side: "after", line: 14 }),
    propertyCommentTarget("unity:200", "m_LocalPosition"),
  );
});
