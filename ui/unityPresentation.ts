import { isMap, isNode, isScalar, isSeq, type Node } from "yaml";
import { unityYaml, unityPointer } from "../shared/unityYaml.ts";
import { propertyLabel, type InspectorValue } from "./propertyPresentation.ts";
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
      const fields = new Map(
        node.items
          .filter((pair) => isScalar(pair.key))
          .map((pair) => [String((pair.key as { value: unknown }).value), pair.value]),
      );
      const text = (key: string) => {
        const value = fields.get(key);
        return isScalar(value) && typeof value.value === "string" ? value.value : undefined;
      };
      // InputActionProperty's normal Inspector exposes an embedded action or
      // an asset reference. Keep internal IDs/flags in Serialized value.
      if (
        fields.size === 3 &&
        ["m_UseReference", "m_Action", "m_Reference"].every((key) => fields.has(key)) &&
        ["0", "1"].includes(text("m_UseReference") ?? "")
      ) {
        const action = fields.get(text("m_UseReference") === "1" ? "m_Reference" : "m_Action");
        if (isNode(action)) {
          const value = convert(action, depth + 1);
          return text("m_UseReference") === "1"
            ? {
                kind: "object",
                label: "Input Action Reference",
                start,
                end,
                entries: [{ label: "Reference", value }],
              }
            : value;
        }
      }
      const actionKeys = [
        "m_Name",
        "m_Type",
        "m_ExpectedControlType",
        "m_Id",
        "m_Processors",
        "m_Interactions",
        "m_SingletonActionBindings",
        "m_Flags",
      ];
      const isAction =
        fields.size === actionKeys.length &&
        actionKeys.every((key) => fields.has(key)) &&
        isSeq(fields.get("m_SingletonActionBindings")) &&
        ["0", "1", "2"].includes(text("m_Type") ?? "");
      const bindingKeys = [
        "m_Name",
        "m_Id",
        "m_Path",
        "m_Interactions",
        "m_Processors",
        "m_Groups",
        "m_Action",
        "m_Flags",
      ];
      const isBinding =
        fields.size === bindingKeys.length &&
        bindingKeys.every((key) => fields.has(key)) &&
        !!text("m_Path");
      const entries = node.items
        .map((pair) => {
          if (!isScalar(pair.key) || !pair.key.range || !isNode(pair.value)) {
            invalid = true;
            return { label: "", value: literal };
          }
          const key = String(pair.key.value);
          const value = convert(pair.value, depth + 1);
          if (isAction && key === "m_SingletonActionBindings") value.expanded = true;
          if (isAction && key === "m_Type")
            value.label = ["Value", "Button", "Pass Through"][Number(text(key))];
          return {
            label:
              isAction && key === "m_SingletonActionBindings"
                ? "Bindings"
                : isAction && key === "m_Type"
                  ? "Action Type"
                  : propertyLabel(key, true),
            key: { start: pair.key.range[0], end: pair.key.range[1] },
            value,
            serializedKey: key,
          };
        })
        .filter(
          (entry) =>
            !(isAction || isBinding) ||
            (entry.serializedKey !== "m_Id" &&
              (entry.serializedKey !== "m_Flags" || text("m_Flags") !== "0")),
        );
      return {
        kind: isAction || isBinding ? "object" : "dictionary",
        expanded: isAction,
        label: isAction ? text("m_Name") || "Input Action" : isBinding ? text("m_Path") : undefined,
        start,
        end,
        entries,
      };
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
