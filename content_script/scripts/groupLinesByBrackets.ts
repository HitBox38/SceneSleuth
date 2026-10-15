// import { parseTscnContent, TscnNode, TscnResource } from "./contentParser";
import { DiffLine } from "./diffParser";

export interface CodeBlock {
  startLine: number | null;
  endLine: number | null;
  content: string;
  type: "addition" | "deletion";
  lines: DiffLine[];
}

/**
 * Groups lines together based on bracket matching
 * @param lines Array of diff lines to process
 * @returns Array of either individual diff lines or code blocks
 */
export const groupLinesByBrackets = (lines: DiffLine[]) => {
  // if (lines.length === 0) return [];
  // console.log("groupLinesByBrackets", lines);
  // // First group by brackets as before
  // // const bracketGrouped = groupByBracketsOnly(lines);
  // // Now enhance with TSCN-specific parsing
  // const result: (DiffLine | CodeBlock | TscnResource | TscnNode)[] = [];
  // const sceneObject: string[] = [];
  // for (const item of lines) {
  //   if ("content" in item) {
  //     // This is a CodeBlock
  //     // Check if this code block looks like a TSCN resource
  //     const firstLine = item.content.trim();
  //     console.log("firstLine", firstLine);
  //     if (
  //       firstLine.startsWith("[") &&
  //       (firstLine.includes("sub_resource") ||
  //         firstLine.includes("ext_resource") ||
  //         firstLine.includes("node name="))
  //     ) {
  //       // This is a TSCN resource block, parse it
  //       const parsedItems = parseTscnContent(item.content);
  //       result.push(...parsedItems);
  //     } else {
  //       // Not a TSCN resource, keep as is
  //       result.push(item);
  //     }
  //   } else {
  //     // Individual line, keep as is
  //     result.push(item);
  //   }
  // }
  // return result;

  const sceneChildren: { type: string; id: string; properties: Record<string, unknown> }[] = [];
  let isBuildingSceneChild = false;

  lines.forEach(({ content: line }, index, arr) => {
    if (
      !isBuildingSceneChild &&
      line.startsWith("[") &&
      (line.includes("sub_resource") || line.includes("node name="))
    ) {
      isBuildingSceneChild = true;
      sceneChildren.push({ type: line.split(" ")[0], id: line.split(" ")[1], properties: {} });
    } else if (isBuildingSceneChild) {
      const [key, value] = line.split("=");
      console.log("sceneChildKey", key);

      if (key.includes("/")) {
        sceneChildren[sceneChildren.length - 1].properties[key.trim().split("/")[1]] = value.trim();
      } else {
        sceneChildren[sceneChildren.length - 1].properties[key.trim()] = (value ?? "").trim();
      }
    } else if (index < arr.length && arr[index + 1]?.content?.startsWith("[")) {
      isBuildingSceneChild = false;
    }
  });

  console.log("sceneChildren", sceneChildren);

  return sceneChildren;
};

export const groupByBracketsOnly = (lines: DiffLine[]): (DiffLine | CodeBlock)[] => {
  if (lines.length === 0) return [];

  const result: (DiffLine | CodeBlock)[] = [];
  let currentIndex = 0;

  while (currentIndex < lines.length) {
    const line = lines[currentIndex];
    const content = line.content;

    // Check if the line has an opening bracket that isn't closed on the same line
    const openingBrackets = ["[", "{", "("];
    const closingBrackets = ["]", "}", ")"];
    const bracketPairs: Record<string, string> = {
      "[": "]",
      "{": "}",
      "(": ")",
    };

    let startsBlock = false;

    for (const bracket of openingBrackets) {
      if (content.includes(bracket)) {
        // Check if there's an unmatched opening bracket
        const openCount = countOccurrences(content, bracket);
        const closeCount = countOccurrences(content, bracketPairs[bracket]);

        if (openCount > closeCount) {
          startsBlock = true;
          break;
        }
      }
    }

    if (startsBlock) {
      // Found an opening bracket, collect all lines until matched
      const blockLines: DiffLine[] = [{ ...line, isPartOfBlock: true }];
      const bracketCounts: Record<string, number> = {};

      // Initialize the count for this bracket type
      for (const b of openingBrackets) {
        bracketCounts[b] = 0;
      }

      // Add the initial brackets from first line
      for (const b of openingBrackets) {
        bracketCounts[b] += countOccurrences(content, b);
      }
      for (const b of closingBrackets) {
        const matchingOpen = openingBrackets[closingBrackets.indexOf(b)];
        bracketCounts[matchingOpen] -= countOccurrences(content, b);
      }

      let endBlockIndex = currentIndex;
      let blockComplete = false;

      // Look ahead for matching closing bracket
      for (let j = currentIndex + 1; j < lines.length; j++) {
        const nextLine = lines[j];
        blockLines.push({ ...nextLine, isPartOfBlock: true });

        // Update bracket counts
        for (const b of openingBrackets) {
          bracketCounts[b] += countOccurrences(nextLine.content, b);
        }
        for (const b of closingBrackets) {
          const matchingOpen = openingBrackets[closingBrackets.indexOf(b)];
          bracketCounts[matchingOpen] -= countOccurrences(nextLine.content, b);
        }

        // Check if all brackets are now balanced
        if (openingBrackets.every((b) => bracketCounts[b] <= 0)) {
          endBlockIndex = j;
          blockComplete = true;
          break;
        }
      }

      if (blockComplete) {
        // Create a code block from the collected lines
        const block: CodeBlock = {
          startLine: line.lineNumber,
          endLine: lines[endBlockIndex].lineNumber,
          content: blockLines.map((l) => l.content).join("\n"),
          type: line.type,
          lines: blockLines,
        };

        result.push(block);
        currentIndex = endBlockIndex + 1;
        continue;
      }
    }

    // If not part of a block or block detection failed, add as individual line
    result.push(line);
    currentIndex++;
  }

  return result;
};

/**
 * Count occurrences of a character in a string
 */
const countOccurrences = (str: string, char: string) => {
  return str.split(char).length - 1;
};
