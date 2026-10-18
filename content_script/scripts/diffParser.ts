import type { SceneReview, SourceLine, SceneSection } from "../../shared/model.ts";
import { compareSections, parseScene } from "./contentParser.ts";
import {
  supportedFileKind,
  reviewFileKind,
  isSettingsFile,
  type GodotFileKind,
} from "../../shared/fileTypes.ts";
import {
  parseUnity,
  parseUnityMetadata,
  describeUnitySections,
  unityReferenceResolver,
} from "./unityParser.ts";

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
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
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
    const oldScene = unity
      ? unityParser(hunk.before, `hunk-${index}`, complete && hunk.before.length === hunk.oldCount)
      : parseScene(hunk.before, `hunk-${index}`, {
          format: format as GodotFileKind,
          startsAtFileBeginning: hunk.oldStart <= 1,
        });
    const newScene = unity
      ? unityParser(hunk.after, `hunk-${index}`, complete && hunk.after.length === hunk.newCount)
      : parseScene(hunk.after, `hunk-${index}`, {
          format: format as GodotFileKind,
          startsAtFileBeginning: hunk.newStart <= 1,
        });
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
  }
  const changes = compareSections(
    [...before.values()],
    [...after.values()],
    !complete,
    unity ? unityReferenceResolver : undefined,
  );
  if (changes.some((change) => change.kind === "unknown"))
    diagnostics.add(
      unity
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
