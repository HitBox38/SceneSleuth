import { observeGithubDiffs, readGithubReview } from "./scripts/githubDom.ts";
import { createInlineReviews } from "../ui/contentRoot.tsx";
import { isReviewRequest, reviewContext } from "../shared/protocol.ts";
import type { ReviewSnapshot, SceneReview, ReferenceNavigation } from "../shared/model.ts";

function start() {
  if (document.documentElement.hasAttribute("data-scenesleuth-active")) return;
  document.documentElement.setAttribute("data-scenesleuth-active", "");
  let snapshot: ReviewSnapshot = {
    reviewKey: "",
    title: "SceneSleuth",
    status: "loading",
    files: [],
  };
  const inlineReviews = createInlineReviews();
  let contextKey: string | undefined;
  let comparisonKey: string | undefined;
  let signature = "";
  let deadline = Date.now() + 10000;
  const cached = new Map<string, SceneReview>();
  let cachedNavigation: ReferenceNavigation | undefined;
  const runtime =
    typeof browser !== "undefined"
      ? browser.runtime
      : typeof chrome !== "undefined"
        ? chrome.runtime
        : undefined;
  function publish() {
    // GitHub may replace a table without changing its scene data.
    inlineReviews.update(snapshot);
    const next = JSON.stringify(snapshot);
    if (next === signature) return;
    signature = next;
    if (runtime)
      void runtime.sendMessage({ action: "REVIEW_UPDATED", snapshot }).catch(() => {
        /* The popup is normally closed. */
      });
  }
  function refresh() {
    cached.clear();
    cachedNavigation = undefined;
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
      cachedNavigation = undefined;
      signature = "";
      deadline = Date.now() + 10000;
    }
    if (!context) {
      snapshot = {
        reviewKey: "",
        title: "SceneSleuth",
        status: "error",
        files: [],
        error: "Open a GitHub pull request to review its Godot files.",
      };
      inlineReviews.update(snapshot);
      return;
    }
    if (!context.isChangesPage) {
      snapshot = {
        reviewKey: context.key,
        title: context.title,
        status: "error",
        files: [],
        error: "Open this pull request's Files changed tab to read its Godot diffs.",
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
          cachedNavigation = undefined;
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
        if (data.navigation) {
          const targets = new Map(
            (data.partialListing ? cachedNavigation?.files : [])?.map((file) => [file.path, file]),
          );
          for (const target of data.navigation.files) targets.set(target.path, target);
          cachedNavigation = { ...data.navigation, files: [...targets.values()] };
        }
        snapshot = {
          reviewKey: `${context.key}:${comparisonKey}`,
          title: context.title,
          status: "ready",
          files: data.partialListing
            ? [...cached.values()]
            : data.files.map((file) => cached.get(file.filePath) ?? file),
          partialListing: data.partialListing,
          navigation: cachedNavigation,
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
    if (message.action === "OPEN_REVIEW") inlineReviews.open();
    sendResponse(snapshot);
  });
  let pending: number | undefined;
  observeGithubDiffs(document.documentElement, () => {
    if (pending !== undefined) return;
    pending = window.setTimeout(() => {
      pending = undefined;
      checkPage();
    }, 150);
  });
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
