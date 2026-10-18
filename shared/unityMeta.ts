import type { ReviewFileTarget } from "./model.ts";

// Only a root-level GUID explicitly present on that side is evidence of a path.
export function unityMetaGuids(
  lines: string[],
): Pick<ReviewFileTarget, "unityGuidBefore" | "unityGuidAfter"> {
  function side(prefix: "+" | "-") {
    if (
      lines.some(
        (line) =>
          (line[0] === " " || line[0] === prefix) &&
          /^folderAsset:\s*(?:yes|true)\s*$/i.test(line.slice(1)),
      )
    )
      return null;
    const values = new Set(
      lines
        .filter((line) => line[0] === " " || line[0] === prefix)
        .flatMap((line) => {
          const match = /^guid: ([a-f\d]{32})\s*$/i.exec(line.slice(1));
          return match && !/^0{32}$/.test(match[1]) ? [match[1].toLowerCase()] : [];
        }),
    );
    return values.size === 1 ? [...values][0] : values.size > 1 ? null : undefined;
  }
  const before = side("-");
  const after = side("+");
  return {
    ...(before !== undefined ? { unityGuidBefore: before } : {}),
    ...(after !== undefined ? { unityGuidAfter: after } : {}),
  };
}
