import type { SceneReview } from "./model.ts";

export interface CommentAnchor {
  side: "before" | "after";
  line: number;
}
export function commentAnchorKey(anchor: CommentAnchor): string {
  return `${anchor.side === "before" ? "L" : "R"}${anchor.line}`;
}
export function commentAnchor(side: string | null, line: string | null): CommentAnchor | undefined {
  if ((side !== "left" && side !== "right") || !line || !/^[1-9]\d*$/.test(line)) return;
  const number = Number(line);
  if (!Number.isSafeInteger(number)) return;
  return { side: side === "left" ? "before" : "after", line: number };
}
export const sectionCommentTarget = (id: string) => `section:${id}`;
export const propertyCommentTarget = (id: string, name: string) => `property:${id}:${name}`;

// Only attach a thread to a known source range. Unchanged/omitted declarations
// and unsupported lines belong in the file's explicitly labelled fallback.
export function reviewCommentTarget(file: SceneReview, anchor: CommentAnchor): string | undefined {
  const lineKey = anchor.side === "before" ? "oldLine" : "newLine";
  for (const section of file.changes) {
    if (section[lineKey] === anchor.line) return sectionCommentTarget(section.id);
    for (const property of section.properties) {
      const start = property[lineKey];
      const value = property[anchor.side];
      if (start === undefined || value === undefined) continue;
      const end = start + value.split("\n").length - 1;
      if (anchor.line >= start && anchor.line <= end)
        return propertyCommentTarget(section.id, property.name);
    }
  }
}
