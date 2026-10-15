import type { DiffLine } from "./diffParser";

export interface TscnResource {
  type: string;
  id?: string;
  path?: string;
  uid?: string;
  properties: Record<string, unknown>;
}

export interface TscnNode {
  name: string;
  type: string;
  groups?: string[];
  properties: Record<string, unknown>;
  children?: TscnNode[];
}

export const parseTscnContent = (lines: DiffLine[]) => {
  const result: (DiffLine | TscnResource | TscnNode)[] = [];
  let currentIndex = 0;

  while (currentIndex < lines.length) {
    const line = lines[currentIndex];
    const content = line.content.trim();

    // Check if this is a resource definition line
    if (
      content.startsWith("[") &&
      (content.includes("sub_resource") ||
        content.includes("ext_resource") ||
        content.includes("node name="))
    ) {
      // Extract the resource/node and its properties
      const resourceObj = parseResourceOrNode(lines, currentIndex);

      if (resourceObj) {
        result.push({
          ...resourceObj.resource,
          type: line.type,
        });
        currentIndex = resourceObj.endIndex + 1;
        continue;
      }
    }

    // If not processed as a resource, add as individual line
    result.push(line);
    currentIndex++;
  }

  return result;
};

/**
 * Parses a resource or node definition and its properties
 */
const parseResourceOrNode = (lines: DiffLine[], startIndex: number) => {
  const firstLine = lines[startIndex].content.trim();

  // Check what type of definition we're dealing with
  if (firstLine.startsWith("[sub_resource")) {
    return parseSubResource(lines, startIndex);
  } else if (firstLine.startsWith("[ext_resource")) {
    return parseExtResource(lines, startIndex);
  } else if (firstLine.startsWith("[node")) {
    return parseNode(lines, startIndex);
  }

  return null;
};

/**
 * Parses a sub_resource definition and its properties
 */
const parseSubResource = (lines: DiffLine[], startIndex: number) => {
  const headerLine = lines[startIndex].content.trim();

  // Extract type and id using regex
  const typeMatch = headerLine.match(/type="([^"]+)"/);
  const idMatch = headerLine.match(/id="([^"]+)"/);

  if (!typeMatch) return null;

  const resource: TscnResource = {
    type: "sub_resource",
    properties: {},
  };

  if (typeMatch && typeMatch[1]) resource.properties.resourceType = typeMatch[1];
  if (idMatch && idMatch[1]) resource.id = idMatch[1];

  // Find all properties until we hit another resource definition or node
  let endIndex = startIndex;
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i].content.trim();

    // If we hit another resource definition or node, stop
    if (line.startsWith("[")) break;

    // Parse property line (format: property = value)
    const propertyMatch = line.match(/^([^ =]+)\s*=\s*(.+)$/);
    if (propertyMatch) {
      const [, propName, propValue] = propertyMatch;
      resource.properties[propName] = parsePropertyValue(propValue);
    }

    endIndex = i;
  }

  return { resource, endIndex };
};

/**
 * Parses an ext_resource definition
 */
const parseExtResource = (lines: DiffLine[], startIndex: number) => {
  const headerLine = lines[startIndex].content.trim();

  // Extract properties using regex
  const typeMatch = headerLine.match(/type="([^"]+)"/);
  const pathMatch = headerLine.match(/path="([^"]+)"/);
  const uidMatch = headerLine.match(/uid="([^"]+)"/);

  if (!typeMatch) return null;

  const resource: TscnResource = {
    type: "ext_resource",
    properties: {},
  };

  if (typeMatch && typeMatch[1]) resource.properties.resourceType = typeMatch[1];
  if (pathMatch && pathMatch[1]) resource.path = pathMatch[1];
  if (uidMatch && uidMatch[1]) resource.uid = uidMatch[1];

  return { resource, endIndex: startIndex };
};

/**
 * Parses a node definition and its properties
 */
function parseNode(
  lines: DiffLine[],
  startIndex: number,
): { resource: TscnNode; endIndex: number } | null {
  const headerLine = lines[startIndex].content.trim();

  // Extract name using regex
  const nameMatch = headerLine.match(/name="([^"]+)"/);
  const typeMatch = headerLine.match(/^[^\s]+\s+([^\s]+)/); // The node type is after [node
  const groupsMatch = headerLine.match(/groups=\["([^"]+)"/);

  if (!nameMatch) return null;

  const node: TscnNode = {
    name: nameMatch[1],
    type: typeMatch ? typeMatch[1].replace('"', "") : "Node",
    properties: {},
    children: [],
  };

  if (groupsMatch && groupsMatch[1]) {
    node.groups = groupsMatch[1].split(",").map((g) => g.trim());
  }

  // Find all properties until we hit another resource definition or node
  let endIndex = startIndex;
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i].content.trim();

    // If we hit another node or resource definition, stop
    if (line.startsWith("[")) break;

    // Parse property line (format: property = value)
    const propertyMatch = line.match(/^([^ =]+)\s*=\s*(.+)$/);
    if (propertyMatch) {
      const [, propName, propValue] = propertyMatch;
      node.properties[propName] = parsePropertyValue(propValue);
    }

    endIndex = i;
  }

  return { resource: node, endIndex };
}

/**
 * Parses a property value based on its format
 */
function parsePropertyValue(value: string) {
  value = value.trim();

  // Handle Vector2
  if (value.startsWith("Vector2(")) {
    const coordsStr = value.substring(8, value.length - 1);
    const coords = coordsStr.split(",").map((c) => parseFloat(c.trim()));
    return { type: "Vector2", x: coords[0], y: coords[1] };
  }

  // Handle ExtResource references
  if (value.startsWith("ExtResource(")) {
    const id = value.substring(12, value.length - 1);
    return { type: "ExtResource", id };
  }

  // Handle booleans
  if (value === "true") return true;
  if (value === "false") return false;

  // Handle numbers
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return value.includes(".") ? parseFloat(value) : parseInt(value, 10);
  }

  // Handle strings - remove quotes if present
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.substring(1, value.length - 1);
  }

  return value;
}
