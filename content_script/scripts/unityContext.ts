import type { SceneReview, SourceLine } from "../../shared/model.ts";
import { reviewFileKind } from "../../shared/fileTypes.ts";
import { parseUnifiedDiff } from "./diffParser.ts";
import { compareSections } from "./contentParser.ts";
import { describeUnitySections, parseUnity, unityReferenceResolver } from "./unityParser.ts";

// Full source supplies ownership and complete values. Only lines in the native
// comparison mark properties as changed; unrelated source is never a new change.
export function reviewUnityContext(
  file: SceneReview,
  before: string[],
  after: string[],
): SceneReview {
  const patch = parseUnifiedDiff(file.rawDiff)[0];
  if (!patch || patch.filePath !== file.filePath || !patch.hunks.length)
    throw new Error("No matching Unity patch.");
  const marked = (text: string[], side: "before" | "after"): SourceLine[] => {
    if (text.length > 50_000 || text.join("\n").length > 2_000_000)
      throw new Error("Unity source exceeds the context limit.");
    const changed = new Set<number>();
    for (const hunk of patch.hunks) {
      const lines = hunk[side];
      if (lines.length !== (side === "before" ? hunk.oldCount : hunk.newCount))
        throw new Error("The native patch is truncated.");
      for (const line of lines) {
        if (text[line.line - 1] !== line.text)
          throw new Error("Unity source does not match this comparison.");
        if (line.changed) changed.add(line.line);
      }
    }
    return text.map((text, index) => ({ text, line: index + 1, changed: changed.has(index + 1) }));
  };
  const oldScene = parseUnity(marked(before, "before"), "source", true);
  const newScene = parseUnity(marked(after, "after"), "source", true);
  if ([...oldScene.diagnostics, ...newScene.diagnostics].length)
    throw new Error("Unity source contains unsupported or ambiguous objects.");
  describeUnitySections(oldScene.sections, reviewFileKind(file));
  describeUnitySections(newScene.sections, reviewFileKind(file));
  const changes = compareSections(
    oldScene.sections,
    newScene.sections,
    true,
    unityReferenceResolver,
  );
  const anchor = (line: number | undefined, raw: string | undefined, side: "before" | "after") => {
    if (line === undefined) return;
    const end = line + (raw?.split("\n").length ?? 1);
    const available = patch.hunks
      .flatMap((hunk) => hunk[side])
      .filter((item) => item.line >= line && item.line < end);
    return available.find((item) => item.changed)?.line ?? available[0]?.line;
  };
  for (const change of changes) {
    for (const property of change.properties) {
      property.oldLine = anchor(property.oldLine, property.before, "before");
      property.newLine = anchor(property.newLine, property.after, "after");
    }
    change.oldLine =
      change.properties.find((property) => property.oldLine)?.oldLine ??
      anchor(change.oldLine, undefined, "before");
    change.newLine =
      change.properties.find((property) => property.newLine)?.newLine ??
      anchor(change.newLine, undefined, "after");
  }
  return {
    ...file,
    sourceContext: "loaded",
    // This remains a change review, not a claim that the patch contains all text.
    changes,
    diagnostics: [],
  };
}
