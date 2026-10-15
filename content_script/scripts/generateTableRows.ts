import { TscnNode, TscnResource } from "./contentParser";
import { DiffLine } from "./diffParser";
import { CodeBlock } from "./groupLinesByBrackets";

/**
 * Generates HTML for a table row for each diff line
 * @param changes The diff lines to generate rows for
 * @returns The HTML for the table rows
 */
export const generateTableRows = (changes: (DiffLine | CodeBlock | TscnResource | TscnNode)[]) => {
  return changes
    .map((change) => {
      console.log(change);

      // Check which type of change we're dealing with
      if ("properties" in change && "type" in change) {
        if ("name" in change) {
          // It's a TscnNode
          return handleTscnNode(change as TscnNode);
        } else {
          // It's a TscnResource
          return handleTscnResource(change as TscnResource);
        }
      } else if ("lines" in change) {
        // Handle code blocks
        return handleCodeBlock(change as CodeBlock);
      } else {
        // Regular diff line
        const diffLine = change as DiffLine;
        const rowClass =
          diffLine.type === "addition"
            ? "addition"
            : diffLine.type === "deletion"
            ? "deletion"
            : "";

        return `
        <tr class="${rowClass}">
          <td class="line-number">${diffLine.lineNumber || ""}</td>
          <td class="content">${escapeHtml(diffLine.content)}</td>
        </tr>
      `;
      }
    })
    .join("");
};

/**
 * Handles a TSCN Resource and returns HTML for the table row
 * @param resource The TSCN resource to render
 * @returns The HTML for the table row
 */
const handleTscnResource = (resource: TscnResource) => {
  const rowClass = resource.type === "addition" ? "addition" : "deletion";

  // Create a formatted JSON-like representation of the resource
  const jsonRepresentation = {
    type:
      resource.type === "sub_resource" || resource.type === "ext_resource"
        ? resource.type
        : resource.properties.resourceType,
    id: resource.id,
    path: resource.path,
    uid: resource.uid,
    properties: resource.properties,
  };

  // Format as JSON with indentation
  const formattedJson = JSON.stringify(jsonRepresentation, null, 2);

  return `
    <tr class="${rowClass} tscn-resource">
      <td class="line-number">TSCN</td>
      <td class="content">
        <pre class="json-like">${escapeHtml(formattedJson)}</pre>
      </td>
    </tr>
  `;
};

/**
 * Handles a TSCN Node and returns HTML for the table row
 * @param node The TSCN node to render
 * @returns The HTML for the table row
 */
const handleTscnNode = (node: TscnNode) => {
  const rowClass = node.type === "addition" ? "addition" : "deletion";

  // Create a formatted JSON-like representation of the node
  const jsonRepresentation = {
    name: node.name,
    type: node.type,
    groups: node.groups,
    properties: node.properties,
    children: node.children,
  };

  // Format as JSON with indentation
  const formattedJson = JSON.stringify(jsonRepresentation, null, 2);

  return `
    <tr class="${rowClass} tscn-node">
      <td class="line-number">TSCN</td>
      <td class="content">
        <pre class="json-like">${escapeHtml(formattedJson)}</pre>
      </td>
    </tr>
  `;
};

/**
 * Handles a code block and returns the HTML for the table row
 * @param codeBlock The code block to handle
 * @returns The HTML for the table row
 */
const handleCodeBlock = (codeBlock: CodeBlock) => {
  const rowClass = codeBlock.type === "addition" ? "addition" : "deletion";

  return `
    <tr class="${rowClass} code-block">
      <td class="line-number">${codeBlock.startLine || ""}-${codeBlock.endLine || ""}</td>
      <td class="content"><pre>${escapeHtml(codeBlock.content)}</pre></td>
    </tr>
  `;
};

/**
 * Escapes HTML special characters in a string
 * @param text The text to escape
 * @returns The escaped text
 */
const escapeHtml = (text: string) => {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};
