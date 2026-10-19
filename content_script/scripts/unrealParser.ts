import type { SceneSection, SceneValue, SourceLine } from "../../shared/model.ts";

import type { UnrealFileKind } from "../../shared/fileTypes.ts";
interface Parsed {
  sections: SceneSection[];
  diagnostics: string[];
}
const maxCharacters = 1_000_000;
const maxLines = 20_000;

function sourceValue(raw: string, lines: SourceLine[], start: number, end = start): SceneValue {
  return {
    raw,
    canonical: raw,
    line: lines[start].line,
    changed: lines.slice(start, end + 1).some((line) => line.changed),
  };
}
function section(
  id: string,
  label: string,
  className: string,
  line: SourceLine,
  known = true,
): SceneSection {
  return {
    id,
    label,
    className,
    kind: known ? "project" : "unknown",
    path: known ? label : "",
    line: line.line,
    headerChanged: known && line.changed,
    attributes: new Map(),
    properties: new Map(),
  };
}
export function unrealFallback(lines: SourceLine[], scope: string, description: string): Parsed {
  if (!lines.length) return { sections: [], diagnostics: [] };
  const raw = lines.map((line) => line.text).join("\n");
  const item = section(
    `unreal:${scope}:unresolved`,
    "Unresolved Unreal context",
    description,
    lines[0],
    false,
  );
  item.properties.set("Source", {
    ...sourceValue(raw, lines, 0, lines.length - 1),
    incomplete: true,
  });
  return {
    sections: [item],
    diagnostics: [
      `${description}; available text is preserved without guessing its owner. Inspect Original diff.`,
    ],
  };
}

// Strict, bounded JSON syntax walk. Values stay as source slices, so large IDs,
// escapes, ordering, and exact source locations never pass through JS numbers.
function descriptorFields(source: string) {
  let cursor = 0,
    nodes = 0;
  const fields: { name: string; start: number; colon: number; end: number }[] = [];
  const space = () => {
    while (/[ \t\r\n]/.test(source[cursor] ?? "") && cursor < source.length) cursor++;
  };
  const fail = (): never => {
    throw new Error("Incomplete, ambiguous, or unsupported JSON descriptor");
  };
  function string(): string {
    const start = cursor++;
    let escaped = false;
    while (cursor < source.length) {
      const char = source[cursor++];
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') return JSON.parse(source.slice(start, cursor)) as string;
    }
    return fail();
  }
  function value(depth: number) {
    if (depth > 32 || ++nodes > 8_000) fail();
    space();
    const opening = source[cursor];
    if (opening === '"') {
      string();
      return;
    }
    if (opening === "{" || opening === "[") {
      const object = opening === "{";
      const closing = object ? "}" : "]";
      const keys = new Set<string>();
      cursor++;
      space();
      if (source[cursor] === closing) {
        cursor++;
        return;
      }
      while (cursor < source.length) {
        space();
        const start = cursor;
        let name = "",
          colon = cursor;
        if (object) {
          if (source[cursor] !== '"') fail();
          name = string();
          if (keys.has(name)) fail();
          keys.add(name);
          space();
          if (source[cursor] !== ":") fail();
          colon = cursor++;
        }
        value(depth + 1);
        if (object && depth === 0) fields.push({ name, start, colon, end: cursor });
        space();
        if (source[cursor] === closing) {
          cursor++;
          return;
        }
        if (source[cursor++] !== ",") fail();
        space();
        if (source[cursor] === closing) fail();
      }
      fail();
    }
    const literal = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
      source.slice(cursor),
    );
    if (!literal) fail();
    cursor += literal![0].length;
  }
  space();
  if (source[cursor] !== "{") fail();
  value(0);
  space();
  if (cursor !== source.length) fail();
  return fields;
}

export function parseUnrealDescriptor(
  lines: SourceLine[],
  scope: string,
  kind: UnrealFileKind,
  startsAtBeginning: boolean,
): Parsed {
  if (!lines.length) return { sections: [], diagnostics: [] };
  if (
    lines.length > maxLines ||
    lines.reduce((size, line) => size + line.text.length, 0) > maxCharacters
  )
    return unrealFallback(lines, scope, "Unreal descriptor exceeds the structured review limit");
  if (!startsAtBeginning)
    return unrealFallback(lines, scope, "The descriptor's root context is outside this hunk");
  const source = lines
    .map((line) => line.text)
    .join("\n")
    .replace(/^\uFEFF/, " ");
  try {
    const fields = descriptorFields(source);
    const label = kind === "unreal_plugin" ? "Plugin descriptor" : "Project descriptor";
    const item = section(
      "unreal:descriptor",
      label,
      kind === "unreal_plugin" ? "UnrealPlugin" : "UnrealProject",
      lines[0],
    );
    const offsets = [0];
    for (let index = 0; index < source.length; index++)
      if (source[index] === "\n") offsets.push(index + 1);
    const lineAt = (offset: number) => {
      let low = 0,
        high = offsets.length;
      while (low + 1 < high) {
        const middle = (low + high) >>> 1;
        if (offsets[middle] <= offset) low = middle;
        else high = middle;
      }
      return low;
    };
    for (const field of fields) {
      const prefix = "\n".repeat(lineAt(field.colon) - lineAt(field.start));
      const raw = prefix + source.slice(field.colon + 1, field.end).replace(/^[ \t]+/, "");
      // Preserve leading newlines: comment ranges start at the field's key line.
      item.properties.set(
        field.name,
        sourceValue(raw, lines, lineAt(field.start), lineAt(field.end - 1)),
      );
    }
    return { sections: [item], diagnostics: [] };
  } catch {
    return unrealFallback(lines, scope, "Incomplete, ambiguous, or unsupported JSON descriptor");
  }
}

// Incremental balance tracking avoids repeatedly scanning a long multiline value.
function valueBalance() {
  const stack: string[] = [];
  let quoted = false,
    escaped = false,
    invalid = false,
    trailing = false;
  return {
    consume(raw: string) {
      for (const char of raw) {
        if (quoted) {
          if (escaped) escaped = false;
          else if (char === "\\") escaped = true;
          else if (char === '"') quoted = false;
        } else if (char === '"') quoted = true;
        else if ("([{".includes(char)) stack.push(char);
        else if (")]}".includes(char)) {
          const expected: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
          if (stack.pop() !== expected[char]) invalid = true;
        }
      }
      trailing = raw.endsWith("\\");
    },
    complete: () => !invalid && !quoted && !stack.length && !trailing,
    invalid: () => invalid,
  };
}

export function parseUnrealConfig(lines: SourceLine[], scope: string): Parsed {
  if (!lines.length) return { sections: [], diagnostics: [] };
  if (
    lines.length > maxLines ||
    lines.reduce((size, line) => size + line.text.length, 0) > maxCharacters
  )
    return unrealFallback(lines, scope, "Unreal config exceeds the structured review limit");
  const sections: SceneSection[] = [];
  const diagnostics: string[] = [];
  const seenSections = new Set<string>();
  let current: SceneSection | undefined;
  let entries: {
    key: string;
    raw: string;
    start: number;
    end: number;
    operator: boolean;
    incomplete?: boolean;
  }[] = [];
  const flush = () => {
    if (!current) return;
    const counts = new Set<string>();
    const ordered = entries.some((entry) => {
      const duplicate = counts.has(entry.key.toLowerCase());
      counts.add(entry.key.toLowerCase());
      return entry.operator || duplicate;
    });
    if (ordered && entries.length) {
      const first = entries[0].start,
        last = entries.at(-1)!.end;
      current.properties.set("Entries (ordered)", {
        ...sourceValue(
          lines
            .slice(first, last + 1)
            .map((line) => line.text)
            .join("\n"),
          lines,
          first,
          last,
        ),
        incomplete: entries.some((entry) => entry.incomplete) || undefined,
      });
    } else
      for (const entry of entries)
        current.properties.set(entry.key, sourceValue(entry.raw, lines, entry.start, entry.end));
    sections.push(current);
    entries = [];
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index],
      text = line.text.trim();
    if (!text || text.startsWith(";")) continue;
    const heading = /^\[([^\]\r\n]+)\]\s*$/.exec(text);
    if (heading) {
      flush();
      const label = heading[1];
      if (seenSections.has(label.toLowerCase()))
        return unrealFallback(
          lines,
          scope,
          "Repeated Unreal config sections require their original ordered text",
        );
      seenSections.add(label.toLowerCase());
      current = section(
        `unreal:config:${scope}:${JSON.stringify(label)}`,
        label,
        "UnrealConfig",
        line,
      );
      continue;
    }
    if (!current)
      current = section(
        `unreal:${scope}:unknown-config`,
        "Unresolved configuration section",
        "UnrealConfig",
        line,
        false,
      );
    const match = /^([^=\r\n]+)=(.*)$/.exec(line.text);
    if (!match) {
      diagnostics.push(
        `Unrecognized Unreal config text near line ${line.line}; inspect Original diff.`,
      );
      entries.push({
        key: `Source line ${line.line}`,
        raw: line.text,
        start: index,
        end: index,
        operator: true,
      });
      continue;
    }
    const start = index,
      key = match[1].trim();
    let raw = match[2].trim();
    const balance = valueBalance();
    balance.consume(raw);
    while (
      !balance.complete() &&
      !balance.invalid() &&
      index + 1 < lines.length &&
      !/^\s*\[[^\]]+\]\s*$/.test(lines[index + 1].text)
    ) {
      const next = `\n${lines[++index].text}`;
      raw += next;
      balance.consume(next);
    }
    const entry = {
      key,
      raw,
      start,
      end: index,
      operator: /^[+.!-]/.test(key),
      incomplete: !balance.complete(),
    };
    entries.push(entry);
    if (!balance.complete()) {
      diagnostics.push(
        `Incomplete Unreal config value near line ${line.line}; inspect Original diff.`,
      );
      // Never present a truncated constructor as a complete structured value.
      entry.operator = true;
    }
  }
  flush();
  return { sections, diagnostics };
}

export function parseUnreal(
  lines: SourceLine[],
  scope: string,
  kind: UnrealFileKind,
  startsAtBeginning: boolean,
): Parsed {
  return kind === "unreal_config"
    ? parseUnrealConfig(lines, scope)
    : parseUnrealDescriptor(lines, scope, kind, startsAtBeginning);
}
