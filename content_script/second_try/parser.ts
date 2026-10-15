import type { SceneObject, Resource, AttrValue } from "./types";

/**
 * Pulls all “+…” lines out of a GitHub diff element into raw .tscn text.
 */
export function extractSceneTextFromDiff(elem: HTMLElement): string {
  const lines: string[] = [];
  elem.querySelectorAll<HTMLTableCellElement>("td.blob-code-addition").forEach((td) => {
    const txt = td.textContent ?? "";
    lines.push(txt.replace(/^\+/, ""));
  });
  return lines.join("\n");
}

/**
 * Parses that raw .tscn text into a SceneObject.
 */
export function parseScene(text: string): SceneObject {
  const ext_resources: Resource[] = [];
  const sub_resources: Resource[] = [];
  const nodes: Resource[] = [];
  const connections: Resource[] = [];
  const scene: SceneObject = {
    ext_resources,
    sub_resources,
    nodes,
    connections,
  };

  const extMap: Record<string, Resource> = {};
  const subMap: Record<string, Resource> = {};

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("[ext_resource")) {
      const inside = line.slice(line.indexOf(" "), line.lastIndexOf("]"));
      const res = parseAttributes(inside);
      ext_resources.push(res);
      if (res.id) extMap[res.id as string] = res;
      continue;
    }
    if (line.startsWith("[sub_resource")) {
      const inside = line.slice(line.indexOf(" "), line.lastIndexOf("]"));
      const res = parseAttributes(inside);
      sub_resources.push(res);
      if (res.id) subMap[res.id as string] = res;
      continue;
    }
    if (line.startsWith("[node")) {
      const inside = line.slice(line.indexOf(" "), line.lastIndexOf("]"));
      nodes.push(parseAttributes(inside));
      continue;
    }
    if (line.startsWith("[connection")) {
      const inside = line.slice(line.indexOf(" "), line.lastIndexOf("]"));
      connections.push(parseAttributes(inside));
      continue;
    }

    if (line.includes("= ExtResource(")) {
      const [lhs, rhs] = line.split("=", 2);
      const key = lhs.trim();
      const m = rhs.match(/ExtResource\("([^"]+)"\)/);
      if (m) scene[key] = extMap[m[1]];
      continue;
    }
    if (line.includes("= SubResource(")) {
      const [lhs, rhs] = line.split("=", 2);
      const key = lhs.trim();
      const m = rhs.match(/SubResource\("([^"]+)"\)/);
      if (m) scene[key] = subMap[m[1]];
      continue;
    }

    if (line.includes("=")) {
      const [lhs, rhs] = line.split("=", 2);
      const key = lhs.trim();
      const value = parseValue(rhs.trim());
      // support nested keys via "/"
      const parts = key.split("/");
      let target: any = scene;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!(parts[i] in target)) target[parts[i]] = {};
        target = target[parts[i]];
      }
      target[parts[parts.length - 1]] = value;
    }
  }

  return scene;
}

function parseAttributes(s: string): Resource {
  const attrs: Resource = {};
  const re = /(\w+)=(".*?"|\[.*?\]|[^"\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const [, key, raw] = m;
    attrs[key] = parseValue(raw);
  }
  return attrs;
}

function parseValue(raw: string): AttrValue {
  const s = raw.trim();
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  if (s.startsWith("[") && s.endsWith("]")) {
    const inner = s.slice(1, -1).trim();
    if (!inner) return [];
    const parts = inner.match(/"[^"]*"|[^,]+/g) || [];
    return parts.map((p) => parseValue(p.trim()));
  }
  const v2 = s.match(/^Vector2\(\s*([^,]+)\s*,\s*([^)]+)\)$/);
  if (v2) {
    return { x: parseFloat(v2[1]), y: parseFloat(v2[2]) };
  }
  return s;
}
