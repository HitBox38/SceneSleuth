import { FileDiff } from "./diffParser";
import { generateTableRows } from "./generateTableRows";

/**
 * Creates a table of changes in a file
 * @param fileDiff The file diff to create the table for
 * @returns The HTML for the table
 */
export const createGodotInspectorTable = (fileDiff: FileDiff) => {
  const tableHTML = `
      <table class="inspector-table">
      <thead>
        <tr>
          <th class="line-column">Line</th>
          <th class="content-column">Content</th>
        </tr>
      </thead>
      <tbody>
        ${generateTableRows(fileDiff.changes)}
      </tbody>
    </table>
    `;

  return tableHTML;
};
