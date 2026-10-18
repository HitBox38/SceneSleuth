import { isAlias, isMap, isNode, isSeq, isScalar, parseDocument, type Node } from "yaml";

// Inspect syntax nodes only. Never construct JS objects, resolve aliases, execute
// tags, or coerce Unity's 64-bit file IDs into JavaScript numbers.
export function unityYaml(raw: string): Node | undefined {
  if (raw.length > 131_072) return;
  try {
    const doc = parseDocument(raw, {
      schema: "failsafe",
      strict: true,
      uniqueKeys: true,
      prettyErrors: false,
      logLevel: "silent",
    });
    if (doc.errors.length || doc.warnings.length || !doc.contents) return;
    let budget = 1000;
    function safe(node: unknown, depth: number): boolean {
      if (node == null) return true;
      if (!isNode(node) || isAlias(node) || node.tag || node.anchor || depth > 16 || --budget < 0)
        return false;
      if (isMap(node))
        return node.items.every((pair) => safe(pair.key, depth + 1) && safe(pair.value, depth + 1));
      if (isSeq(node)) return node.items.every((item) => safe(item, depth + 1));
      return true;
    }
    return safe(doc.contents, 0) ? doc.contents : undefined;
  } catch {
    return undefined;
  }
}

export function unityPointer(node: unknown): { fileID: string; guid?: string } | undefined {
  if (!isMap(node)) return;
  const fields = new Map<string, string>();
  for (const pair of node.items) {
    if (
      !isScalar(pair.key) ||
      !isScalar(pair.value) ||
      typeof pair.key.value !== "string" ||
      typeof pair.value.value !== "string"
    )
      return;
    if (!["fileID", "guid", "type"].includes(pair.key.value)) return;
    fields.set(pair.key.value, pair.value.value);
  }
  const fileID = fields.get("fileID");
  const guid = fields.get("guid");
  if (!fileID || !/^-?\d+$/.test(fileID) || (guid !== undefined && !/^[a-f\d]{32}$/i.test(guid)))
    return;
  return { fileID, ...(guid && !/^0{32}$/.test(guid) ? { guid: guid.toLowerCase() } : {}) };
}
