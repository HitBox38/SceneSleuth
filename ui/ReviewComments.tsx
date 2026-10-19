import { createContext, useContext } from "react";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "../popup/src/components/ui/button.tsx";
import type { SceneReview, SectionChange } from "../shared/model.ts";
import {
  commentAnchorKey,
  reviewCommentTarget,
  sectionCommentTarget,
  propertyCommentTarget,
  type CommentAnchor,
} from "../shared/reviewComments.ts";

export interface ReviewComments {
  anchors: CommentAnchor[];
  available: string[];
  add: (anchor: CommentAnchor) => void;
}
export const ReviewCommentsContext = createContext<ReviewComments | undefined>(undefined);

export function AddReviewComment({ side, line }: { side: CommentAnchor["side"]; line?: number }) {
  const comments = useContext(ReviewCommentsContext);
  if (!comments || !line || !comments.available.includes(commentAnchorKey({ side, line })))
    return null;
  return (
    <Button
      className="ss-add-comment"
      variant="ghost"
      aria-label={`Add comment on ${side === "before" ? "before" : "after"} line ${line}`}
      onPress={(event) => {
        const details = event.target.closest("details");
        if (details) details.open = true;
        comments.add({ side, line });
      }}
    >
      <MessageSquarePlus size={13} aria-hidden="true" />
    </Button>
  );
}
function CommentSlot({ anchor, file }: { anchor: CommentAnchor; file: SceneReview }) {
  const label = `${anchor.side === "before" ? "Before" : "After"} line ${anchor.line}`;
  return (
    <div className="ss-comment-thread">
      <span className="ss-comment-location">
        {file.reviewUrl ? (
          <a href={`${file.reviewUrl}${commentAnchorKey(anchor)}`}>{label}</a>
        ) : (
          label
        )}
      </span>
      <div data-ss-comment-slot={commentAnchorKey(anchor)} />
    </div>
  );
}
export function ReviewCommentSlots({ file, target }: { file: SceneReview; target: string }) {
  const comments = useContext(ReviewCommentsContext);
  return comments?.anchors
    .filter((anchor) => reviewCommentTarget(file, anchor) === target)
    .map((anchor) => <CommentSlot key={commentAnchorKey(anchor)} anchor={anchor} file={file} />);
}
export function OtherReviewComments({
  file,
  changes,
}: {
  file: SceneReview;
  changes: SectionChange[];
}) {
  const comments = useContext(ReviewCommentsContext);
  const visible = new Set(
    changes.flatMap((change) => [
      sectionCommentTarget(change.id),
      ...change.properties.map((property) => propertyCommentTarget(change.id, property.name)),
    ]),
  );
  const anchors = comments?.anchors.filter(
    (anchor) => !visible.has(reviewCommentTarget(file, anchor) ?? ""),
  );
  if (!anchors?.length) return null;
  return (
    <section className="ss-other-comments" aria-label="Comments on other lines in this file">
      <h3>Comments on other lines in this file</h3>
      <p className="ss-muted">These source lines are outside the visible structured changes.</p>
      {anchors.map((anchor) => (
        <CommentSlot key={commentAnchorKey(anchor)} anchor={anchor} file={file} />
      ))}
    </section>
  );
}
