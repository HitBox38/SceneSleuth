import { isMap, isNode, isScalar, isSeq, type Node } from "yaml";
import { unityYaml, unityPointer } from "../shared/unityYaml.ts";
import type { InspectorValue } from "./propertyPresentation.ts";
import type { StructuredValue } from "./structuredValues.ts";

export function unityInspectorValue(raw: string): InspectorValue | undefined {
  const node = unityYaml(raw);
  if (!isMap(node) || !node.flow) return;
  const values = new Map<string, string>();
  for (const pair of node.items) {
    if (
      !isScalar(pair.key) ||
      !isScalar(pair.value) ||
      typeof pair.key.value !== "string" ||
      !pair.value.range
    )
      return;
    const value = raw.slice(pair.value.range[0], pair.value.range[1]);
    if (
      !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) ||
      !Number.isFinite(Number(value))
    )
      return;
    values.set(pair.key.value, value);
  }
  const color = values.size === 4 && ["r", "g", "b", "a"].every((key) => values.has(key));
  const axes = color ? ["r", "g", "b", "a"] : ["x", "y", "z", "w"].slice(0, values.size);
  if (values.size < 2 || values.size > 4 || !axes.every((key) => values.has(key))) return;
  const components = axes.map((label) => ({ label, value: values.get(label)! }));
  if (color && components.some(({ value }) => Number(value) < 0 || Number(value) > 1)) return;
  return {
    kind: color ? "color" : "vector",
    components,
    ...(color
      ? {
          swatch: `rgba(${components
            .slice(0, 3)
            .map((c) => Number(c.value) * 255)
            .join(", ")}, ${Number(components[3].value)})`,
        }
      : {}),
  };
}

export function unityStructuredValue(raw: string): StructuredValue | undefined {
  const root = unityYaml(raw);
  let budget = 400;
  let invalid = false;
  function convert(node: Node, depth: number): StructuredValue {
    if (--budget < 0 || depth > 12 || !node.range) {
      invalid = true;
      return { kind: "literal", start: 0, end: raw.length };
    }
    const [start, end] = node.range;
    const literal: StructuredValue = { kind: "literal", start, end };
    if (unityPointer(node) || unityInspectorValue(raw.slice(start, end))) return literal;
    if (isMap(node)) {
      const entries = node.items.map((pair) => {
        if (!isScalar(pair.key) || !pair.key.range || !isNode(pair.value)) {
          invalid = true;
          return { label: "", value: literal };
        }
        return {
          label: String(pair.key.value),
          key: { start: pair.key.range[0], end: pair.key.range[1] },
          value: convert(pair.value, depth + 1),
        };
      });
      return { kind: "dictionary", start, end, entries };
    }
    if (isSeq(node))
      return {
        kind: "array",
        start,
        end,
        entries: node.items.map((item, index) => {
          if (!isNode(item)) {
            invalid = true;
            return { label: `[${index}]`, value: literal };
          }
          return { label: `[${index}]`, value: convert(item, depth + 1) };
        }),
      };
    return literal;
  }
  if (!root) return;
  const result = convert(root, 0);
  return !invalid && result.kind !== "literal" ? result : undefined;
}
