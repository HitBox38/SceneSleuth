import { addGodotInspectorStyles } from "./scripts/addGodotInspectorStyles";
import { type FileDiff, parsePRDiff } from "./scripts/diffParser";
// import { replaceDiffWithGodotInspector } from "./scripts/replaceDiffWithGodotInspector";

// Store our parsed diffs
const parsedDiffs: FileDiff[] = [];
let isInitialLoadComplete = false;

const processAllDiffElements = () => {
  const customElements = document.querySelectorAll(
    "copilot-diff-entry:not([data-godot-processed='true'])",
  );

  if (customElements && customElements.length > 0) {
    console.log(`Found ${customElements.length} unprocessed elements`);

    // Add Godot inspector styles once
    addGodotInspectorStyles();

    customElements.forEach((element) => {
      const dataFilePath = element.getAttribute("data-file-path")?.split(".");

      if (dataFilePath && dataFilePath[dataFilePath.length - 1] === "tscn") {
        const diff = parsePRDiff(element.outerHTML) as FileDiff;
        parsedDiffs.push(diff);

        // Send the data to the popup
        sendToPopup({
          action: "NEW_DIFF",
          payload: diff,
        });

        // Replace just the diff content with our custom element
        // replaceDiffWithGodotInspector(element, diff);
      } else {
        // Mark non-tscn files as processed too
        element.setAttribute("data-godot-processed", "true");
      }
    });

    // Send a complete collection of diffs
    sendToPopup({
      action: "ALL_DIFFS",
      payload: parsedDiffs,
    });

    return customElements;
  } else {
    if (isInitialLoadComplete) {
      console.log("No new custom elements found");
    } else {
      console.log("Custom elements not found on initial load");
    }
    return null;
  }
};

/**
 * Send data to the popup using browser APIs
 */
function sendToPopup(message: unknown) {
  // Chrome and Firefox compatible way to send messages
  if (typeof browser !== "undefined") {
    // Firefox
    browser.runtime.sendMessage(message).catch((err) => {
      // Suppress errors when popup isn't open
      if (!err.message.includes("Receiving end does not exist")) {
        console.error("Error sending message to popup:", err);
      }
    });
  } else {
    // Chrome
    chrome.runtime.sendMessage(message, () => {
      if (chrome.runtime.lastError) {
        // Suppress errors when popup isn't open
        if (!chrome.runtime.lastError.message?.includes("Receiving end does not exist")) {
          console.error("Error sending message to popup:", chrome.runtime.lastError);
        }
      }
    });
  }
}

// Listen for messages from popup
function setupMessageListener() {
  if (typeof browser !== "undefined") {
    // Firefox
    browser.runtime.onMessage.addListener((message) => {
      if (message.action === "GET_DIFFS") {
        return Promise.resolve({ diffs: parsedDiffs });
      }
    });
  } else {
    // Chrome
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.action === "GET_DIFFS") {
        sendResponse({ diffs: parsedDiffs });
      }
      return true; // Required to use sendResponse asynchronously
    });
  }
}

// Wait for page to finish loading before processing
window.addEventListener("load", () => {
  // Setup message listener right away
  setupMessageListener();

  // Process after a short delay to ensure GitHub has finished loading its content
  setTimeout(() => {
    processAllDiffElements();
    isInitialLoadComplete = true;

    // Setup observer for dynamically loaded content
    const observer = new MutationObserver((mutations) => {
      // Check if any mutation added new diff elements
      let newDiffsAdded = false;

      mutations.forEach((mutation) => {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          // Check if any added node is a diff or contains a diff
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              if (
                element.querySelector("copilot-diff-entry") ||
                element.tagName.toLowerCase() === "copilot-diff-entry"
              ) {
                newDiffsAdded = true;
              }
            }
          });
        }
      });

      // Only process if new diffs were added
      if (newDiffsAdded) {
        processAllDiffElements();
      }
    });

    // Start observing
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }, 1000); // Wait 1 second after load to allow GitHub to finish rendering
});
