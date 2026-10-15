import { createGodotInspectorTable } from "./createGodotInspectorTable";
import type { FileDiff } from "./diffParser";

/**
 * Replaces the diff content with a custom Godot Inspector table
 * @param element The element to replace the diff content with
 * @param fileDiff The diff to replace the content with
 */
export const replaceDiffWithGodotInspector = (element: Element, fileDiff: FileDiff) => {
  // Skip if already processed
  if (element.getAttribute("data-godot-processed") === "true") {
    return;
  }

  // Create our Godot inspector table
  const inspectorHtml = createGodotInspectorTable(fileDiff);

  // Find the diff content area (the table part) within this element
  const diffContent = element.querySelector(".js-file-content");
  if (!diffContent) return;

  // Replace only the table part of the content
  // First, store any elements that should be preserved like the file header
  const diffTable = diffContent.querySelector(".diff-table");
  if (diffTable) {
    // Replace just the diff table with our inspector table
    diffTable.outerHTML = inspectorHtml;

    // Make sure the content is visible (remove the hidden class)
    // but preserve the other classes that control behavior
    diffContent.classList.remove("Details-content--hidden");

    // Mark as processed to avoid infinite loops
    element.setAttribute("data-godot-processed", "true");
  }
};
