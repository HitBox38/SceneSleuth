import { isMap, isNode, isScalar, isSeq } from "yaml";
import type { SceneSection, SourceLine, ValueReference } from "../../shared/model.ts";
import type { ReviewFileKind } from "../../shared/fileTypes.ts";
import { unityYaml, unityPointer as pointer } from "../../shared/unityYaml.ts";

const objectHeader = /^--- !u!(\d+) &(-?\d+)( stripped)?\s*$/;
const propertyHeader = /^  ([A-Za-z_][\w ]*):(?:[ \t]*(.*))?$/;
// Stable package script identity, verified against Unity's published source:
// https://github.com/Unity-Technologies/InputSystem/blob/4e169d9b2343f3104ce58c9fda499e721acfc2e8/Packages/com.unity.inputsystem/InputSystem/Runtime/Plugins/XR/TrackedPoseDriver.cs.meta
const packageScripts = new Map([["c2fadf230d1919748a9aa21d40f74619", "TrackedPoseDriver"]]);
function scalar(raw?: string): string | undefined {
  if (raw === undefined) return;
  const node = unityYaml(raw);
  return isScalar(node) && typeof node.value === "string" ? node.value : undefined;
}

export function parseUnity(lines: SourceLine[], scope: string, complete: boolean) {
  const sections: SceneSection[] = [];
  const diagnostics = new Set<string>();
  const ids = new Set<string>();
  let current: SceneSection | undefined;
  let unknown: SceneSection | undefined;
  const unresolved = () => {
    if (!unknown) {
      unknown = {
        id: `unknown:${scope}`,
        kind: "unknown",
        label: "Unresolved Unity context",
        className: "",
        path: "Object or property owner is outside this hunk",
        line: lines[0]?.line ?? 1,
        headerChanged: false,
        attributes: new Map(),
        properties: new Map(),
      };
      sections.push(unknown);
    }
    return unknown;
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.text.trim() || line.text.startsWith("%")) continue;
    const header = objectHeader.exec(line.text);
    if (header) {
      const root = /^([A-Za-z_]\w*):\s*$/.exec(lines[index + 1]?.text ?? "");
      const duplicate = ids.has(header[2]);
      ids.add(header[2]);
      current = {
        id: duplicate ? `unknown:${scope}:duplicate:${index}` : `unity:${header[2]}`,
        kind: duplicate ? "unknown" : "unity_object",
        label: root?.[1] ?? `Class ${header[1]}`,
        className: root?.[1] ?? "",
        path: `fileID ${header[2]}`,
        line: line.line,
        headerChanged: line.changed,
        attributes: new Map(),
        properties: new Map(),
      };
      current.attributes.set("fileID", {
        raw: header[2],
        canonical: header[2],
        line: line.line,
        changed: line.changed,
      });
      current.attributes.set("classID", {
        raw: header[1],
        canonical: header[1],
        line: line.line,
        changed: line.changed,
      });
      if (root)
        current.attributes.set("type", {
          raw: root[1],
          canonical: root[1],
          line: lines[index + 1].line,
          changed: lines[index + 1].changed,
        });
      if (header[3])
        current.attributes.set("stripped", {
          raw: "true",
          canonical: "true",
          line: line.line,
          changed: line.changed,
        });
      if (duplicate)
        diagnostics.add("Duplicate Unity file IDs were found; inspect the original diff.");
      if (!root) diagnostics.add(`Unity object type is outside the diff near line ${line.line}.`);
      sections.push(current);
      if (root) index++;
      continue;
    }
    if (line.text.startsWith("---")) {
      current = undefined;
      diagnostics.add(
        `Unsupported Unity document header near line ${line.line}; inspect the original diff.`,
      );
    }
    const property = propertyHeader.exec(line.text);
    if (!property) {
      if (line.changed) {
        const section = unresolved();
        const previous = section.properties.get("Diff text");
        const raw = previous ? `${previous.raw}\n${line.text}` : line.text;
        section.properties.set("Diff text", {
          raw,
          canonical: raw,
          line: previous?.line ?? line.line,
          changed: true,
          incomplete: true,
        });
      }
      continue;
    }
    const group = [line];
    while (
      index + 1 < lines.length &&
      !propertyHeader.test(lines[index + 1].text) &&
      !lines[index + 1].text.startsWith("---")
    )
      group.push(lines[++index]);
    const raw =
      (property[2] ?? "") +
      group
        .slice(1)
        .map((item) => `\n${item.text}`)
        .join("");
    const node = unityYaml(raw);
    const incomplete =
      (!!raw.trim() && !node) || (!complete && index === lines.length - 1 && group.length > 1);
    if (incomplete)
      diagnostics.add(
        `Unity value near line ${line.line} may be incomplete or unsupported; inspect the original diff.`,
      );
    const target = current ?? unresolved();
    if (target.properties.has(property[1]))
      diagnostics.add(
        `Duplicate Unity property near line ${line.line}; inspect the original diff.`,
      );
    target.properties.set(property[1], {
      raw,
      canonical: raw.trimEnd(),
      line: line.line,
      changed: group.some((item) => item.changed),
      ...(incomplete ? { incomplete: true } : {}),
    });
  }
  return { sections, diagnostics: [...diagnostics] };
}

export function describeUnitySections(sections: SceneSection[], format: ReviewFileKind) {
  const byId = new Map(
    sections
      .filter((section) => section.id.startsWith("unity:"))
      .map((section) => [section.attributes.get("fileID")!.raw, section]),
  );
  for (const section of byId.values()) {
    const name = scalar(section.properties.get("m_Name")?.raw);
    section.label = name || section.className || "Unity object";
    if (section.className === "GameObject") section.kind = "gameobject";
  }
  for (const section of byId.values()) {
    if (section.kind === "gameobject") continue;
    const owner = pointer(unityYaml(section.properties.get("m_GameObject")?.raw ?? ""));
    const gameObject = owner && !owner.guid ? byId.get(owner.fileID) : undefined;
    if (
      (owner && owner.fileID !== "0" && !owner.guid) ||
      ["Transform", "RectTransform"].includes(section.className) ||
      (section.className === "MonoBehaviour" && ["unity_scene", "unity_prefab"].includes(format))
    ) {
      section.kind = "component";
      if (gameObject?.kind === "gameobject") section.label = gameObject.label;
    }
  }
  // Use the Transform chain as hierarchy evidence, without inventing parents
  // for stripped prefab objects or incomplete hunks.
  const transforms = new Map<string, SceneSection | null>();
  for (const section of byId.values()) {
    if (!["Transform", "RectTransform"].includes(section.className)) continue;
    const owner = pointer(unityYaml(section.properties.get("m_GameObject")?.raw ?? ""));
    if (owner && !owner.guid)
      transforms.set(owner.fileID, transforms.has(owner.fileID) ? null : section);
  }
  function hierarchy(gameObject: SceneSection, seen = new Set<string>()): string | undefined {
    if (seen.size >= 64 || seen.has(gameObject.id)) return;
    seen.add(gameObject.id);
    const transform = transforms.get(gameObject.attributes.get("fileID")!.raw);
    const father = pointer(unityYaml(transform?.properties.get("m_Father")?.raw ?? ""));
    if (!father || father.guid) return;
    if (father.fileID === "0") return gameObject.label;
    const parentTransform = byId.get(father.fileID);
    const parentRef = pointer(
      unityYaml(parentTransform?.properties.get("m_GameObject")?.raw ?? ""),
    );
    const parent = parentRef && !parentRef.guid ? byId.get(parentRef.fileID) : undefined;
    if (parent?.kind !== "gameobject") return;
    const prefix = hierarchy(parent, seen);
    return prefix ? `${prefix}/${gameObject.label}` : undefined;
  }
  for (const section of byId.values()) {
    const owner = pointer(unityYaml(section.properties.get("m_GameObject")?.raw ?? ""));
    const gameObject =
      section.kind === "gameobject"
        ? section
        : owner && !owner.guid
          ? byId.get(owner.fileID)
          : undefined;
    if (gameObject?.kind === "gameobject") section.path = hierarchy(gameObject) ?? section.path;
    if (section.className === "MonoBehaviour") {
      const identifier = scalar(section.properties.get("m_EditorClassIdentifier")?.raw);
      if (identifier?.includes("::"))
        section.className = identifier.split("::").pop()!.split(".").pop() || section.className;
      else {
        const script = pointer(unityYaml(section.properties.get("m_Script")?.raw ?? ""));
        if (script?.guid) section.className = packageScripts.get(script.guid) ?? section.className;
      }
    }
  }
}

export function unityReferenceResolver(sections: SceneSection[]) {
  const byId = new Map(
    sections
      .filter((section) => section.id.startsWith("unity:"))
      .map((section) => [section.attributes.get("fileID")!.raw, section]),
  );
  return (raw: string | undefined): ValueReference[] => {
    if (!raw) return [];
    const root = unityYaml(raw);
    const references: ValueReference[] = [];
    function visit(node: unknown) {
      if (!isNode(node)) return;
      const ref = pointer(node);
      if (ref && node.range) {
        const target = !ref.guid ? byId.get(ref.fileID) : undefined;
        if (ref.fileID === "0" || ref.guid || target)
          references.push({
            start: node.range[0],
            end: node.range[1],
            label:
              ref.fileID === "0"
                ? "None"
                : target
                  ? `${target.label} (${target.className || "Unity object"})`
                  : `GUID ${ref.guid}`,
            target: `fileID ${ref.fileID}${ref.guid ? ` · GUID ${ref.guid}` : ""}`,
            className: target?.className ?? "Unity object",
            ...(ref.guid && ref.fileID !== "0" ? { unityGuid: ref.guid } : {}),
          });
        return;
      }
      if (isMap(node))
        for (const pair of node.items) {
          visit(pair.key);
          visit(pair.value);
        }
      if (isSeq(node)) for (const item of node.items) visit(item);
    }
    visit(root);
    return references;
  };
}

// Metadata has no Unity document headers. Root scalars belong to the file;
// importer properties require an explicit root mapping in this same hunk.
export function parseUnityMetadata(lines: SourceLine[], scope: string, complete: boolean) {
  const sections: SceneSection[] = [];
  const diagnostics = new Set<string>();
  let importer: SceneSection | undefined;
  let root: SceneSection | undefined;
  const importers = new Set<string>();
  let unknown: SceneSection | undefined;
  const section = (
    id: string,
    label: string,
    line: SourceLine,
    unresolved = false,
  ): SceneSection => {
    const result: SceneSection = {
      id,
      kind: unresolved ? "unknown" : "unity_object",
      label,
      className: unresolved ? "" : "Importer settings",
      path: "",
      line: line.line,
      headerChanged: line.changed && !unresolved,
      attributes: new Map(),
      properties: new Map(),
    };
    sections.push(result);
    return result;
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.text.trim() || line.text.trimStart().startsWith("#")) continue;
    const header = /^([A-Za-z_]\w*):\s*$/.exec(line.text);
    if (header) {
      const duplicate = importers.has(header[1]);
      importers.add(header[1]);
      importer = section(
        duplicate ? `unknown:${scope}:duplicate:${index}` : `meta:importer:${header[1]}`,
        duplicate ? `Duplicate ${header[1]}` : header[1],
        line,
        duplicate,
      );
      if (duplicate)
        diagnostics.add(
          `Duplicate metadata importer near line ${line.line}; inspect the original diff.`,
        );
      continue;
    }
    const top = /^([A-Za-z_]\w*):(?:[ \t]*(.*))?$/.exec(line.text);
    const property = top ?? propertyHeader.exec(line.text);
    if (top) importer = undefined;
    const group = [line];
    while (
      index + 1 < lines.length &&
      !/^(?:[A-Za-z_]\w*:|  [A-Za-z_]\w*:)/.test(lines[index + 1].text)
    )
      group.push(lines[++index]);
    const target = top
      ? (root ??= section("meta:file", "File metadata", line))
      : (importer ??
        (unknown ??= section(
          `unknown:${scope}`,
          "Unresolved import settings context",
          line,
          true,
        )));
    const raw = property
      ? (property[2] ?? "") +
        group
          .slice(1)
          .map((item) => `\n${item.text}`)
          .join("")
      : group.map((item) => item.text).join("\n");
    const name = property ? property[1] : `Diff text L${line.line}`;
    const duplicate = target.properties.has(name);
    const incomplete =
      !property ||
      duplicate ||
      (!!raw.trim() && !unityYaml(raw)) ||
      (!complete && index === lines.length - 1 && group.length > 1);
    if (duplicate)
      diagnostics.add(`Duplicate metadata key near line ${line.line}; inspect the original diff.`);
    if (incomplete)
      diagnostics.add(
        `Import value near line ${line.line} may be incomplete or unsupported; inspect the original diff.`,
      );
    target.properties.set(duplicate ? `${name} (duplicate at L${line.line})` : name, {
      raw: duplicate ? group.map((item) => item.text).join("\n") : raw,
      canonical: raw.trimEnd(),
      line: line.line,
      changed: group.some((item) => item.changed),
      ...(incomplete ? { incomplete: true } : {}),
    });
  }
  return { sections, diagnostics: [...diagnostics] };
}
