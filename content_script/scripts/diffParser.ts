import { TscnNode, TscnResource } from "./contentParser";
import { CodeBlock, groupLinesByBrackets } from "./groupLinesByBrackets";

export interface DiffLine {
  lineNumber: number | null;
  content: string;
  type: "addition" | "deletion";
  isPartOfBlock?: boolean;
}

export interface FileDiff {
  fileName: string;
  filePath: string;
  changes: (DiffLine | CodeBlock | TscnResource | TscnNode)[];
  stats: {
    additions: number;
    deletions: number;
  };
}

/**
 * Parses a GitHub PR diff element and extracts file information and diff details
 * with bracket matching for code blocks
 * @param htmlElement - The HTML element containing the PR diff
 * @returns Object with file name and changes (deletions and additions)
 */
export const parsePRDiff = (htmlElement: string): FileDiff => {
  // Create a DOM parser to work with the HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlElement, "text/html");

  // Extract the file name and path
  const filePathElement = doc.querySelector("a.Link--primary.Truncate-text");
  const filePath =
    filePathElement?.getAttribute("title") ||
    filePathElement?.textContent?.trim() ||
    "unknown-file";
  const fileName = filePath.split("/").pop() || filePath;

  // Extract the diff information
  const diffRows = doc.querySelectorAll("table.diff-table tr:not(.sr-only)");

  // First pass: collect all lines without any grouping
  const rawChanges: DiffLine[] = [];
  let deletionCount = 0;
  let additionCount = 0;

  // Parse each row of the diff table
  diffRows.forEach((row) => {
    // Skip hunk headers (rows with blob-num-hunk class)
    if (row.querySelector(".blob-num-hunk")) {
      return;
    }

    const oldLineNumElement = row.querySelector(".blob-num-deletion");
    const newLineNumElement = row.querySelector(".blob-num-addition");

    // Process code content
    const codeElement = row.querySelector(".blob-code");
    if (!codeElement) return;

    const codeContent = codeElement.textContent?.trim() || "";

    // Determine if this is a deletion, addition
    if (oldLineNumElement && codeElement.classList.contains("blob-code-deletion")) {
      const lineNumber = parseInt(oldLineNumElement.getAttribute("data-line-number") || "", 10);
      deletionCount++;

      if (codeContent.trim() !== "") {
        rawChanges.push({
          lineNumber: !isNaN(lineNumber) ? lineNumber : null,
          content: codeContent,
          type: "deletion",
        });
      }
    } else if (newLineNumElement && codeElement.classList.contains("blob-code-addition")) {
      const lineNumber = parseInt(newLineNumElement.getAttribute("data-line-number") || "", 10);
      additionCount++;

      if (codeContent.trim() !== "") {
        rawChanges.push({
          lineNumber: !isNaN(lineNumber) ? lineNumber : null,
          content: codeContent,
          type: "addition",
        });
      }
    }
  });

  // Second pass: group lines with matching brackets
  // const processedChanges =
  groupLinesByBrackets(rawChanges);

  return {
    fileName,
    filePath,
    changes: [],
    stats: {
      additions: additionCount,
      deletions: deletionCount,
    },
  };
};
