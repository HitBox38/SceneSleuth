// A bounded presentation view of complete serialized collections. This never
// changes scene parsing/comparison or evaluates Godot constructors.
export interface ValueSlice {
  start: number;
  end: number;
}
export interface ValueEntry {
  label: string;
  key?: ValueSlice;
  value: StructuredValue;
}
export interface StructuredValue extends ValueSlice {
  kind: "literal" | "dictionary" | "array" | "object";
  label?: string;
  entries?: ValueEntry[];
  expanded?: boolean;
}

function separators(raw: string, start: number, end: number, delimiter: string) {
  const positions: number[] = [];
  const stack: string[] = [];
  let quoted = false;
  let escaped = false;
  const pairs: Record<string, string> = { "]": "[", "}": "{", ")": "(" };
  for (let index = start; index < end; index++) {
    const char = raw[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === ";") return; // Preserve comments in the source fallback.
    else if ("[({".includes(char)) stack.push(char);
    else if ("]})".includes(char)) {
      if (stack.pop() !== pairs[char]) return;
    } else if (char === delimiter && !stack.length) positions.push(index);
  }
  return quoted || stack.length ? undefined : positions;
}

function keyLabel(raw: string) {
  try {
    const decoded: unknown = JSON.parse(raw);
    if (typeof decoded === "string") return decoded;
  } catch {
    // Godot keys can also be StringNames and other expressions.
  }
  return raw;
}

export function structuredValue(raw: string): StructuredValue | undefined {
  if (raw.length > 32_768) return;
  let remaining = 400;
  let invalid = false;
  function parse(start: number, end: number, depth: number): StructuredValue {
    while (start < end && /\s/.test(raw[start])) start++;
    while (end > start && /\s/.test(raw[end - 1])) end--;
    const literal: StructuredValue = { kind: "literal", start, end };
    if (remaining-- <= 0 || depth > 12 || start === end) {
      invalid = true;
      return literal;
    }
    const text = raw.slice(start, end);
    const object = /^Object\s*\(/.exec(text);
    const kind =
      text[0] === "{" ? "dictionary" : text[0] === "[" ? "array" : object ? "object" : undefined;
    if (!kind) return literal;
    const opening = object ? start + object[0].length - 1 : start;
    const closing = kind === "dictionary" ? "}" : kind === "array" ? "]" : ")";
    if (raw[end - 1] !== closing || !separators(raw, start, end, ",")) {
      invalid = true;
      return literal;
    }
    const commas = separators(raw, opening + 1, end - 1, ",");
    if (!commas) {
      invalid = true;
      return literal;
    }
    const parts: ValueSlice[] = [];
    let partStart = opening + 1;
    for (const partEnd of [...commas, end - 1]) {
      if (raw.slice(partStart, partEnd).trim()) parts.push({ start: partStart, end: partEnd });
      else if (partEnd !== end - 1 || (commas.length && parts.length === 0)) invalid = true;
      partStart = partEnd + 1;
    }
    let label: string | undefined;
    if (kind === "object") {
      const type = parts.shift();
      label = type && raw.slice(type.start, type.end).trim();
      if (!label || !/^[A-Za-z_]\w*$/.test(label)) invalid = true;
    }
    const entries = parts.map((part, index): ValueEntry => {
      if (kind === "array")
        return { label: `[${index}]`, value: parse(part.start, part.end, depth + 1) };
      const colons = separators(raw, part.start, part.end, ":");
      if (!colons || colons.length !== 1) {
        invalid = true;
        return { label: "", value: parse(part.start, part.end, depth + 1) };
      }
      const key = raw.slice(part.start, colons[0]).trim();
      if (!key) invalid = true;
      const keyStart = raw.indexOf(key, part.start);
      return {
        label: keyLabel(key) || key,
        key: { start: keyStart, end: keyStart + key.length },
        value: parse(colons[0] + 1, part.end, depth + 1),
      };
    });
    return { kind, start, end, label, entries };
  }
  const value = parse(0, raw.length, 0);
  return invalid || value.kind === "literal" ? undefined : value;
}
