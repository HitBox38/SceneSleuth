import type { SceneReview } from "../shared/model.ts";

// External declarations point to other files. Keep them in the source review,
// but do not present those files as cards inside this scene's inline view.
export function inlineFileContents(file: SceneReview): SceneReview {
  return {
    ...file,
    changes: file.changes.filter((change) => change.kind !== "ext_resource"),
  };
}
