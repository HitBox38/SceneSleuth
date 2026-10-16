import { readGithubReview } from "./scripts/githubDom.ts";
import { createInspector } from "../ui/contentRoot.tsx";
import { isReviewRequest, reviewContext } from "../shared/protocol.ts";
import type { ReviewSnapshot, SceneReview } from "../shared/model.ts";

function start() {
  if (document.getElementById("scenesleuth-root")) return;
  let snapshot: ReviewSnapshot = {
    reviewKey: "",
    title: "SceneSleuth",
    status: "loading",
    files: [],
  };
  let inspector: ReturnType<typeof createInspector> | undefined;
  let contextKey: string | undefined;
  let comparisonKey: string | undefined;
  let signature = "";
  let deadline = Date.now() + 10000;
  const cached = new Map<string, SceneReview>();
  const runtime =
    typeof browser !== "undefined"
      ? browser.runtime
      : typeof chrome !== "undefined"
        ? chrome.runtime
        : undefined;
  function publish() {
    const next = JSON.stringify(snapshot);
    if (next === signature) return;
    signature = next;
    inspector?.update(snapshot);
    if (runtime)
      void runtime.sendMessage({ action: "REVIEW_UPDATED", snapshot }).catch(() => {
        /* The popup is normally closed. */
      });
  }
  function refresh() {
    cached.clear();
    signature = "";
    deadline = Date.now() + 10000;
    checkPage();
  }
  function checkPage() {
    const context = reviewContext(location.href);
    const pageKey = context ? `${context.key}:${location.pathname}:${location.search}` : undefined;
    if (pageKey !== contextKey) {
      contextKey = pageKey;
      comparisonKey = undefined;
      cached.clear();
      signature = "";
      deadline = Date.now() + 10000;
      inspector?.dispose();
      inspector = undefined;
    }
    if (!context) {
      snapshot = {
        reviewKey: "",
        title: "SceneSleuth",
        status: "error",
        files: [],
        error: "Open a GitHub pull request to review its scenes.",
      };
      return;
    }
    if (!inspector || !document.getElementById("scenesleuth-root")) {
      inspector?.dispose();
      inspector = createInspector(refresh);
      signature = "";
    }
    if (!context.isChangesPage) {
      snapshot = {
        reviewKey: context.key,
        title: context.title,
        status: "error",
        files: [],
        error: "Open this pull request's Files changed tab to read its scene diffs.",
        changesUrl: context.changesUrl,
      };
      publish();
      return;
    }
    try {
      const data = readGithubReview(document, context.changesUrl);
      if (!data) {
        snapshot = {
          reviewKey: context.key,
          title: context.title,
          status: Date.now() < deadline ? "loading" : "error",
          files: [],
          error:
            "GitHub's diff data is unavailable or this layout is unsupported. Wait for Files changed to load, then refresh SceneSleuth.",
        };
      } else {
        if (comparisonKey !== data.comparisonKey) {
          cached.clear();
          comparisonKey = data.comparisonKey;
        }
        for (const file of data.files) {
          const previous = cached.get(file.filePath);
          if (
            !previous ||
            previous.pending ||
            (!file.pending && file.rawDiff.length >= previous.rawDiff.length)
          )
            cached.set(file.filePath, file);
        }
        snapshot = {
          reviewKey: `${context.key}:${comparisonKey}`,
          title: context.title,
          status: "ready",
          files: data.files.map((file) => cached.get(file.filePath) ?? file),
        };
      }
    } catch (error) {
      snapshot = {
        reviewKey: context.key,
        title: context.title,
        status: "error",
        files: [],
        error: error instanceof Error ? error.message : "Could not read this review.",
      };
    }
    publish();
  }
  runtime?.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isReviewRequest(message)) return;
    if (message.action === "REFRESH_REVIEW") refresh();
    else checkPage();
    if (message.action === "OPEN_REVIEW") inspector?.open();
    sendResponse(snapshot);
  });
  let pending: number | undefined;
  const observer = new MutationObserver(() => {
    if (pending !== undefined) return;
    pending = window.setTimeout(() => {
      pending = undefined;
      checkPage();
    }, 150);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("popstate", checkPage);
  document.addEventListener("turbo:load", checkPage);
  document.addEventListener("pjax:end", checkPage);
  // Bound loading even when GitHub stops mutating the document.
  window.setInterval(() => {
    if (snapshot.status === "loading") checkPage();
  }, 1000);
  checkPage();
}
if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
