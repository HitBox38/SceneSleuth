import type { SceneReview, SourceLine, SceneSection } from "../../shared/model.ts";
import { compareSections, parseScene, describeGodotSettings } from "./contentParser.ts";
import {
  supportedFileKind,
  reviewFileKind,
  isSettingsFile,
  type GodotFileKind,
  type UnrealFileKind,
} from "../../shared/fileTypes.ts";
import {
  parseUnity,
  parseUnityMetadata,
  describeUnitySections,
  unityReferenceResolver,
} from "./unityParser.ts";

import { parseUnreal, unrealFallback } from "./unrealParser.ts";

interface Hunk {
  oldStart: number;
  newStart: number;
  before: SourceLine[];
  after: SourceLine[];
  oldCount: number;
  newCount: number;
}
export interface PatchFile {
  filePath: string;
  previousPath?: string;
  status: SceneReview["status"];
  hunks: Hunk[];
  rawDiff: string;
}

function patchPath(raw: string): string {
  let value = raw.split("\t")[0];
  if (value.startsWith('"')) {
    try {
      value = JSON.parse(value) as string;
    } catch {
      /* Keep a malformed path visible. */
    }
  }
  return value.replace(/^[ab]\//, "");
}

export function parseUnifiedDiff(text: string): PatchFile[] {
  const files: PatchFile[] = [];
  let file: PatchFile | undefined, hunk: Hunk | undefined;
  let oldLine = 0,
    newLine = 0;
  // GitHub's last JSON diff row can retain CR without a following patch LF.
  // Normalize that line ending too, without stripping carriage returns in values.
  for (const line of text.replace(/\r\n/g, "\n").replace(/\r$/, "").split("\n")) {
    if (line.startsWith("diff --git ")) {
      file = { filePath: "", status: "modified", hunks: [], rawDiff: line + "\n" };
      files.push(file);
      hunk = undefined;
      continue;
    }
    if (!file) continue;
    file.rawDiff += line + "\n";
    if (!hunk && line.startsWith("--- ")) {
      const path = patchPath(line.slice(4));
      if (path === "/dev/null") file.status = "added";
      else file.previousPath = path;
    } else if (!hunk && line.startsWith("+++ ")) {
      const path = patchPath(line.slice(4));
      if (path === "/dev/null") {
        file.status = "removed";
        file.filePath = file.previousPath ?? "";
      } else file.filePath = path;
      if (file.status === "modified" && file.previousPath !== file.filePath)
        file.status = "renamed";
    } else if (line.startsWith("rename from ")) file.previousPath = patchPath(line.slice(12));
    else if (line.startsWith("rename to ")) {
      file.filePath = patchPath(line.slice(10));
      file.status = "renamed";
    } else if (line.startsWith("@@ ")) {
      const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (!match) continue;
      oldLine = Number(match[1]);
      newLine = Number(match[3]);
      hunk = {
        oldStart: oldLine,
        newStart: newLine,
        before: [],
        after: [],
        oldCount: Number(match[2] ?? 1),
        newCount: Number(match[4] ?? 1),
      };
      file.hunks.push(hunk);
    } else if (hunk) {
      if (line.startsWith("-"))
        hunk.before.push({ text: line.slice(1), line: oldLine++, changed: true });
      else if (line.startsWith("+"))
        hunk.after.push({ text: line.slice(1), line: newLine++, changed: true });
      else if (line.startsWith(" ")) {
        hunk.before.push({ text: line.slice(1), line: oldLine++, changed: false });
        hunk.after.push({ text: line.slice(1), line: newLine++, changed: false });
      }
    }
  }
  return files.filter(
    (file) => supportedFileKind(file.filePath) || supportedFileKind(file.previousPath),
  );
}

export function reviewPatch(file: PatchFile): SceneReview {
  const format = reviewFileKind(file);
  const unity = format.startsWith("unity_");
  const unreal = format.startsWith("unreal_");
  const unityParser = format === "unity_metadata" ? parseUnityMetadata : parseUnity;
  const before = new Map<string, SceneSection>();
  const after = new Map<string, SceneSection>();
  function collect(target: Map<string, SceneSection>, sections: SceneSection[]) {
    for (const section of sections) {
      const previous = target.get(section.id);
      if (!previous) target.set(section.id, section);
      else {
        previous.headerChanged ||= section.headerChanged;
        for (const [key, value] of section.attributes) previous.attributes.set(key, value);
        for (const [key, value] of section.properties) previous.properties.set(key, value);
      }
    }
  }
  const diagnostics = new Set<string>();
  let additions = 0,
    deletions = 0;
  let complete =
    file.hunks.length === 1 &&
    ((file.status === "added" && file.hunks[0].newStart === 1 && file.hunks[0].oldCount === 0) ||
      (file.status === "removed" && file.hunks[0].oldStart === 1 && file.hunks[0].newCount === 0));
  for (const [index, hunk] of file.hunks.entries()) {
    let oldScene = unreal
      ? parseUnreal(hunk.before, `hunk-${index}`, format as UnrealFileKind, hunk.oldStart <= 1)
      : unity
        ? unityParser(
            hunk.before,
            `hunk-${index}`,
            complete && hunk.before.length === hunk.oldCount,
          )
        : parseScene(hunk.before, `hunk-${index}`, {
            format: format as GodotFileKind,
            startsAtFileBeginning: hunk.oldStart <= 1,
          });
    let newScene = unreal
      ? parseUnreal(hunk.after, `hunk-${index}`, format as UnrealFileKind, hunk.newStart <= 1)
      : unity
        ? unityParser(hunk.after, `hunk-${index}`, complete && hunk.after.length === hunk.newCount)
        : parseScene(hunk.after, `hunk-${index}`, {
            format: format as GodotFileKind,
            startsAtFileBeginning: hunk.newStart <= 1,
          });
    // Compare the same source block on both sides when a descriptor is partial.
    // Otherwise complete fields on just one side could look falsely deleted.
    if (
      unreal &&
      format !== "unreal_config" &&
      [...oldScene.sections, ...newScene.sections].some((section) => section.kind === "unknown")
    ) {
      oldScene = unrealFallback(
        hunk.before,
        `hunk-${index}`,
        "Descriptor context is incomplete on one side",
      );
      newScene = unrealFallback(
        hunk.after,
        `hunk-${index}`,
        "Descriptor context is incomplete on one side",
      );
    }
    for (const note of [...oldScene.diagnostics, ...newScene.diagnostics]) diagnostics.add(note);
    if (hunk.before.length !== hunk.oldCount || hunk.after.length !== hunk.newCount) {
      complete = false;
      diagnostics.add("This patch is truncated. Some changes may be missing.");
    }
    additions += hunk.after.filter((line) => line.changed).length;
    deletions += hunk.before.filter((line) => line.changed).length;
    // Match only explicit section identities across hunks. Each hunk's unknown
    // context has its own identity, so missing headers never inherit an owner.
    collect(before, oldScene.sections);
    collect(after, newScene.sections);
  }
  if (!file.hunks.length) {
    complete = false;
    diagnostics.add("No textual hunks were available for this file.");
  }
  if (unity) {
    describeUnitySections([...before.values()], format);
    describeUnitySections([...after.values()], format);
  } else if (!unreal) {
    describeGodotSettings([...before.values()], format as GodotFileKind);
    describeGodotSettings([...after.values()], format as GodotFileKind);
  }
  const changes = compareSections(
    [...before.values()],
    [...after.values()],
    !complete,
    unity ? unityReferenceResolver : unreal ? () => () => [] : undefined,
  );
  if (changes.some((change) => change.kind === "unknown"))
    diagnostics.add(
      unreal
        ? "Some Unreal context is outside the diff. Available source is preserved without guessing settings or descriptor fields."
        : unity
          ? "Some Unity objects or property owners are outside the diff. Their context remains unresolved."
          : isSettingsFile(file)
            ? "Some settings sections are outside the diff. Their changes are listed without guessing a section."
            : "Some owning sections are outside the diff. Their changes are listed without guessing a node or resource.",
    );
  return {
    filePath: file.filePath,
    previousPath: file.previousPath !== file.filePath ? file.previousPath : undefined,
    status: file.status,
    coverage: complete ? "complete" : "partial",
    additions,
    deletions,
    changes,
    diagnostics: [...diagnostics],
    rawDiff: file.rawDiff,
  };
}

export function reviewDiff(text: string): SceneReview[] {
  return parseUnifiedDiff(text).map(reviewPatch);
}
