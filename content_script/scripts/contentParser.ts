import type {
  SourceLine,
  SceneValue,
  SceneSection,
  SectionKind,
  SectionChange,
  PropertyChange,
} from "../../shared/model.ts";
import { sceneReferenceResolver } from "./sceneReferences.ts";
import type { GodotFileKind } from "../../shared/fileTypes.ts";

// A lexical pass is enough to preserve values without evaluating Godot expressions.
export function canonicalValue(text: string): string {
  let result = "",
    quoted = false,
    escaped = false,
    comment = false;
  for (const character of text) {
    if (comment) {
      if (character === "\n") comment = false;
      continue;
    }
    if (quoted) {
      result += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') {
      quoted = true;
      result += character;
    } else if (character === ";") comment = true;
    else if (!/\s/.test(character)) result += character;
  }
  return result;
}

function balanced(text: string): boolean {
  let quoted = false,
    escaped = false,
    comment = false;
  const stack: string[] = [];
  const pairs: Record<string, string> = { "]": "[", "}": "{", ")": "(" };
  for (const character of text) {
    if (comment) {
      if (character === "\n") comment = false;
      continue;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === ";") comment = true;
    else if ("[{(".includes(character)) stack.push(character);
    else if ("]})".includes(character) && stack.pop() !== pairs[character]) return false;
  }
  return !quoted && stack.length === 0;
}

function decode(raw = ""): string {
  if (raw.startsWith('"')) {
    try {
      return JSON.parse(raw) as string;
    } catch {
      /* Keep unfamiliar escapes intact. */
    }
  }
  return raw;
}

function attributes(text: string, line: SourceLine): Map<string, SceneValue> {
  const result = new Map<string, SceneValue>();
  const pattern = /(\w+)\s*=\s*/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const start = pattern.lastIndex;
    let end = start;
    for (; end < text.length; end++) {
      if (/\s/.test(text[end]) && balanced(text.slice(start, end))) break;
    }
    const raw = text.slice(start, end);
    result.set(match[1], {
      raw,
      canonical: canonicalValue(raw),
      line: line.line,
      changed: line.changed,
    });
    pattern.lastIndex = end;
  }
  return result;
}

export function parseScene(
  lines: SourceLine[],
  scope = "scene",
  options: { format?: GodotFileKind; startsAtFileBeginning?: boolean } = {},
): { sections: SceneSection[]; diagnostics: string[] } {
  const sections: SceneSection[] = [];
  const diagnostics: string[] = [];
  let current: SceneSection | undefined;
  const project = options.format === "project";
  let preamble = project && options.startsAtFileBeginning;
  const projectHeader = (text: string) =>
    text.trim().match(/^\[((?:\\.|[^\]\\\n])+)\](?:\s*;[^\n]*)?$/);
  for (let index = 0; index < lines.length; index++) {
    const first = lines[index];
    if (!first.text.trim() || first.text.trimStart().startsWith(";")) continue;
    let raw = first.text;
    let changed = first.changed;
    const settingsHeader = project ? projectHeader(raw) : undefined;
    let recovery: { index: number; raw: string; changed: boolean } | undefined;
    while (!settingsHeader && !balanced(raw) && index + 1 < lines.length) {
      const next = lines[index + 1];
      // A new section cannot finish a truncated value from another hunk.
      if (project && projectHeader(next.text) && !recovery)
        recovery = { index: index + 1, raw, changed };
      if (
        !project &&
        /^\[(?:node|ext_resource|sub_resource|connection|gd_scene)\b/.test(next.text.trim())
      )
        break;
      index++;
      raw += `\n${next.text}`;
      changed ||= next.changed;
    }
    // A line such as ["value"] can be a nested array, not a section. Recover at
    // a possible settings header only when the value never closes in this hunk.
    if (project && !balanced(raw) && recovery) {
      index = recovery.index - 1;
      raw = recovery.raw;
      changed = recovery.changed;
    }
    if (!settingsHeader && !balanced(raw))
      diagnostics.push(`Incomplete value near line ${first.line}; inspect the original diff.`);
    if (settingsHeader) {
      const name = settingsHeader[1].replaceAll("\\]", "]");
      current = {
        id: `project:section:${JSON.stringify(name)}`,
        kind: "project",
        label: name,
        className: "ProjectSettings",
        path: name,
        line: first.line,
        headerChanged: changed,
        attributes: new Map(),
        properties: new Map(),
      };
      sections.push(current);
      preamble = false;
      continue;
    }
    const header = raw
      .trim()
      .match(
        /^\[(gd_scene|node|ext_resource|sub_resource|connection)\b([\s\S]*)\](?:\s*;[^\n]*)?$/,
      );
    if (header && !project) {
      const kind: SectionKind = header[1] === "gd_scene" ? "scene" : (header[1] as SectionKind);
      const attrs = attributes(header[2], { ...first, changed });
      const get = (name: string) => decode(attrs.get(name)?.raw);
      const parent = get("parent");
      const name = get("name");
      const path =
        kind === "node"
          ? parent === "."
            ? name
            : parent
              ? `${parent}/${name}`
              : "."
          : get("path");
      const identity =
        kind === "node"
          ? JSON.stringify([parent, name])
          : kind === "connection"
            ? JSON.stringify([get("signal"), get("from"), get("to"), get("method")])
            : kind === "scene"
              ? "header"
              : get("id");
      current = {
        id: `${kind}:${identity || scope + ":" + first.line}`,
        kind,
        label:
          kind === "node"
            ? name || "Unnamed node"
            : kind === "connection"
              ? `${get("signal")} → ${get("method")}`
              : kind === "scene"
                ? "Scene settings"
                : get("path")?.split("/").pop() || get("id") || "Unnamed resource",
        className: get("type") || (get("instance") ? "Scene instance" : ""),
        path: kind === "connection" ? `${get("from")} → ${get("to")}` : path,
        line: first.line,
        headerChanged: changed,
        attributes: attrs,
        properties: new Map(),
      };
      sections.push(current);
      continue;
    }
    if (raw.trimStart().startsWith("[")) {
      current = undefined;
      preamble = false;
      diagnostics.push(`Unsupported section near line ${first.line}; inspect the original diff.`);
      continue;
    }
    const assignment = raw.match(/^\s*("(?:\\.|[^"\\])*"|[^=\n]+?)\s*=\s*([\s\S]*)$/);
    if (!assignment) {
      if (changed)
        diagnostics.push(
          `Unrecognized ${project ? "project settings" : "scene"} text near line ${first.line}; preserved in the original diff.`,
        );
      continue;
    }
    if (!current && preamble) {
      current = {
        id: "project:preamble",
        kind: "project",
        label: "File settings",
        className: "ProjectSettings",
        path: "",
        line: first.line,
        headerChanged: false,
        attributes: new Map(),
        properties: new Map(),
      };
      sections.push(current);
    }
    if (!current) {
      current = {
        id: `unknown:${scope}`,
        kind: "unknown",
        label: project ? "Unresolved settings context" : "Unresolved scene context",
        className: "",
        path: "Owning section is outside this hunk",
        line: first.line,
        headerChanged: false,
        attributes: new Map(),
        properties: new Map(),
      };
      sections.push(current);
    }
    const value = assignment[2].trim();
    current.properties.set(project ? decode(assignment[1].trim()) : assignment[1].trim(), {
      raw: value,
      canonical: canonicalValue(value),
      line: first.line,
      changed,
    });
  }
  return { sections, diagnostics };
}

export function sourceLines(text: string): SourceLine[] {
  return text.split(/\r?\n/).map((text, index) => ({ text, line: index + 1, changed: true }));
}

export function compareSections(
  before: SceneSection[],
  after: SceneSection[],
  partial: boolean,
): SectionChange[] {
  const oldMap = new Map(before.map((section) => [section.id, section]));
  const newMap = new Map(after.map((section) => [section.id, section]));
  const changes: SectionChange[] = [];
  const resolveBefore = sceneReferenceResolver(before);
  const resolveAfter = sceneReferenceResolver(after);
  for (const id of new Set([...oldMap.keys(), ...newMap.keys()])) {
    const oldSection = oldMap.get(id),
      newSection = newMap.get(id);
    const section = newSection ?? oldSection!;
    const properties: PropertyChange[] = [];
    const compare = (
      oldValues: Map<string, SceneValue>,
      newValues: Map<string, SceneValue>,
      prefix = "",
    ) => {
      for (const key of new Set([...oldValues.keys(), ...newValues.keys()])) {
        const oldValue = oldValues.get(key),
          newValue = newValues.get(key);
        if (oldValue?.canonical === newValue?.canonical) continue;
        if (partial && !oldValue?.changed && !newValue?.changed) continue;
        const beforeReferences = resolveBefore(oldValue?.raw, oldSection);
        const afterReferences = resolveAfter(newValue?.raw, newSection);
        properties.push({
          name: prefix + key,
          operation: !oldValue ? "added" : !newValue ? "removed" : "modified",
          before: oldValue?.raw,
          after: newValue?.raw,
          ...(beforeReferences.length ? { beforeReferences } : {}),
          ...(afterReferences.length ? { afterReferences } : {}),
          oldLine: oldValue?.line,
          newLine: newValue?.line,
        });
      }
    };
    compare(oldSection?.attributes ?? new Map(), newSection?.attributes ?? new Map(), "@");
    compare(oldSection?.properties ?? new Map(), newSection?.properties ?? new Map());
    const operation =
      !oldSection && (!partial || newSection?.headerChanged)
        ? "added"
        : !newSection && (!partial || oldSection?.headerChanged)
          ? "removed"
          : "modified";
    if (!properties.length && operation === "modified") continue;
    changes.push({
      id,
      kind: section.kind,
      operation,
      label: section.label,
      className: section.className,
      path: section.path,
      oldLine: oldSection?.line,
      newLine: newSection?.line,
      properties,
    });
  }
  return changes;
}
