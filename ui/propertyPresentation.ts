import type { PropertyChange, SectionChange } from "../shared/model.ts";

export interface InspectorValue {
  kind: "vector" | "color";
  components: { label: string; value: string }[];
  swatch?: string;
}

// Presentation only: accept complete numeric literals, never evaluate scene text.
export function inspectorValue(raw: string): InspectorValue | undefined {
  const match = /^(Vector[234]i?|Color)\(\s*([^()]*)\s*\)$/.exec(raw.trim());
  if (!match) return;
  const values = match[2].split(",").map((value) => value.trim());
  if (
    values.some(
      (value) =>
        !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) ||
        !Number.isFinite(Number(value)),
    )
  )
    return;
  const color = match[1] === "Color";
  if (values.length !== (color ? 4 : Number(match[1][6]))) return;
  if (match[1].endsWith("i") && values.some((value) => !Number.isInteger(Number(value)))) return;
  // HDR and out-of-range colors retain source text rather than a misleading swatch.
  if (color && values.some((value) => Number(value) < 0 || Number(value) > 1)) return;
  const axes = color ? ["r", "g", "b", "a"] : ["x", "y", "z", "w"];
  return {
    kind: color ? "color" : "vector",
    components: values.map((value, index) => ({ label: axes[index], value })),
    ...(color
      ? {
          swatch: `rgba(${values
            .slice(0, 3)
            .map((value) => Number(value) * 255)
            .join(", ")}, ${Number(values[3])})`,
        }
      : {}),
  };
}

export function propertyLabel(name: string, unity = false): string {
  return (unity ? name.replace(/^m_/, "").replace(/([a-z\d])([A-Z])/g, "$1 $2") : name)
    .replace(/^@/, "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function propertyCategory(change: SectionChange, name: string): string {
  if (
    change.kind === "component" &&
    ["Transform", "RectTransform"].includes(change.className) &&
    /^m_Local(?:Position|Rotation|Scale|EulerAnglesHint)$/.test(name)
  )
    return "Transform";
  if (change.kind === "unity_object") {
    if (change.className === "AnimationClip") {
      if (
        /^m_(?:RotationCurves|CompressedRotationCurves|EulerCurves|PositionCurves|ScaleCurves|FloatCurves|PPtrCurves|EditorCurves|EulerEditorCurves)$/.test(
          name,
        )
      )
        return "Tracks and keyframes";
      if (name === "m_Events") return "Events";
      if (
        /^m_(?:AnimationClipSettings|SampleRate|WrapMode|Legacy|Compressed|UseHighQualityCurve)$/.test(
          name,
        )
      )
        return "Clip settings";
    }
    if (change.className === "AnimatorOverrideController" && name === "m_Clips")
      return "Clip replacements";
    if (change.className === "AnimatorController") {
      if (name === "m_AnimatorParameters") return "Parameters";
      if (name === "m_AnimatorLayers") return "Layers";
    }
    if (
      change.className === "AnimatorStateMachine" &&
      /^m_(?:ChildStates|ChildStateMachines|AnyStateTransitions|EntryTransitions|StateMachineTransitions|DefaultState)$/.test(
        name,
      )
    )
      return "State machine";
    if (/^Animator(?:State)?Transition$/.test(change.className)) {
      if (name === "m_Conditions") return "Conditions";
      if (/^m_(?:DstState|DstStateMachine|IsExit)$/.test(name)) return "Destination";
      if (
        /^m_(?:TransitionDuration|TransitionOffset|ExitTime|HasExitTime|HasFixedDuration|InterruptionSource|OrderedInterruption|CanTransitionToSelf)$/.test(
          name,
        )
      )
        return "Timing";
    }
  }
  if (change.kind !== "node") return "Properties";
  if (
    /[23]D$/.test(change.className) &&
    /^(?:position|rotation|rotation_degrees|scale|skew|transform)$/.test(name)
  )
    return "Transform";
  if (
    /[23]D$/.test(change.className) &&
    /^(?:visible|modulate|self_modulate|show_behind_parent|visibility_layer)$/.test(name)
  )
    return "Visibility";
  if (
    /^(?:collision_layer|collision_mask|input_pickable)$/.test(name) &&
    /(?:Body|Area)[23]D$/.test(change.className)
  )
    return "Collision";
  return "Properties";
}

export function propertyGroups(
  change: SectionChange,
): { label: string; properties: PropertyChange[] }[] {
  const groups = new Map<string, PropertyChange[]>();
  for (const property of change.properties) {
    const label = propertyCategory(change, property.name);
    const group = groups.get(label) ?? [];
    group.push(property);
    groups.set(label, group);
  }
  return [...groups].map(([label, properties]) => ({ label, properties }));
}
