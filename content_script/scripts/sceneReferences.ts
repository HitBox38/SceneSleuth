import type { SceneSection, SceneValue, ValueReference } from "../../shared/model.ts";

function stringValue(value?: SceneValue): string | undefined {
  if (!value) return undefined;
  return quotedString(value.canonical);
}
function quotedString(raw: string): string | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

// One resolver per file version, built from all available declarations, including
// unchanged context. A reference never borrows a declaration from the other side.
export function sceneReferenceResolver(sections: SceneSection[]) {
  const resources = new Map<string, SceneSection>();
  const nodes = new Map<string, SceneSection | null>();
  const pathsByName = new Map<string, Set<string>>();
  for (const section of sections) {
    if (section.kind === "node") {
      nodes.set(section.path, nodes.has(section.path) ? null : section);
    } else if (section.kind === "ext_resource" || section.kind === "sub_resource") {
      const id = stringValue(section.attributes.get("id"));
      if (id !== undefined) resources.set(`${section.kind}:${id}`, section);
      if (section.kind === "ext_resource" && section.path) {
        const paths = pathsByName.get(section.label) ?? new Set<string>();
        paths.add(section.path);
        pathsByName.set(section.label, paths);
      }
    }
  }

  function target(kind: string, id: string, owner?: SceneSection) {
    if (kind === "NodePath") {
      // Absolute/unique paths and paths in animation resources need context that
      // the local scene diff does not establish.
      if (owner?.kind !== "node" || !id || id.startsWith("/") || id.includes("%")) return;
      const [nodePath, ...subnames] = id.split(":");
      const parts = owner.path === "." ? [] : owner.path.split("/");
      for (const part of nodePath.split("/")) {
        if (!part || part === ".") continue;
        if (part === "..") {
          if (!parts.length) return;
          parts.pop();
        } else parts.push(part);
      }
      const node = nodes.get(parts.join("/") || ".");
      if (!node) return;
      const path = node.path === "." ? node.label : node.path;
      const suffix = subnames.length ? `:${subnames.join(":")}` : "";
      return { label: path + suffix, target: path + suffix, className: node.className };
    }
    const resource = resources.get(
      `${kind === "ExtResource" ? "ext_resource" : "sub_resource"}:${id}`,
    );
    if (!resource) return;
    if (kind === "ExtResource") {
      if (!resource.path) return;
      return {
        label: (pathsByName.get(resource.label)?.size ?? 0) > 1 ? resource.path : resource.label,
        target: resource.path,
        resourcePath: resource.path,
        className: resource.className,
      };
    }
    return {
      label:
        stringValue(resource.properties.get("resource_name")) ||
        resource.className ||
        resource.label,
      target: `Embedded resource ${id}`,
      className: resource.className,
    };
  }

  return (
    raw: string | undefined,
    owner?: SceneSection,
    propertyName?: string,
  ): ValueReference[] => {
    if (!raw) return [];
    if (owner?.kind === "project") {
      // Godot configurations store file paths directly as quoted strings. Keep UID
      // references and expressions opaque; the autoload '*' marker is significant.
      const match = /^\s*("(?:\\.|[^"\\])*")\s*(?:;[^\n]*)?$/.exec(raw);
      const value = match ? quotedString(match[1]) : undefined;
      const singleton = owner.path === "autoload" && value?.startsWith("*res://");
      const path = singleton ? value?.slice(1) : value;
      const relative =
        (owner.className === "GDExtension" && ["libraries", "icons"].includes(owner.path)) ||
        (owner.className === "EditorPlugin" &&
          owner.path === "plugin" &&
          propertyName === "script");
      if (
        !match ||
        !path ||
        (!path.startsWith("res://") &&
          (!relative || /^[\w+.-]+:/.test(path) || path.startsWith("/") || path.startsWith("\\")))
      )
        return [];
      const start = raw.indexOf(match[1]);
      return [
        {
          start,
          end: start + match[1].length,
          label: `${singleton ? "*" : ""}${path.split("/").pop() || path}`,
          target: path,
          resourcePath: path,
          className: singleton ? "Autoload singleton" : "File",
        },
      ];
    }
    const references: ValueReference[] = [];
    let quoted = false,
      escaped = false,
      comment = false;
    for (let index = 0; index < raw.length; index++) {
      const character = raw[index];
      if (comment) {
        if (character === "\n") comment = false;
      } else if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
      } else if (character === '"') quoted = true;
      else if (character === ";") comment = true;
      else if (/[A-Za-z_]/.test(character)) {
        const token = raw.slice(index).match(/^[A-Za-z_]\w*/)?.[0] ?? character;
        const match = /^(ExtResource|SubResource|NodePath)\s*\(\s*("(?:\\.|[^"\\])*")\s*\)/.exec(
          raw.slice(index),
        );
        if (match && !/[\w.]/.test(raw[index - 1] ?? "")) {
          const id = quotedString(match[2]);
          const resolved = id === undefined ? undefined : target(match[1], id, owner);
          if (resolved)
            references.push({ start: index, end: index + match[0].length, ...resolved });
          index += match[0].length - 1;
        } else index += token.length - 1;
      }
    }
    return references;
  };
}
