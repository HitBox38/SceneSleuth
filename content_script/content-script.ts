import { observeGithubDiffs, readGithubReview } from "./scripts/githubDom.ts";
import { createInlineReviews } from "../ui/contentRoot.tsx";
import { isReviewRequest, reviewContext } from "../shared/protocol.ts";
import type { ReviewSnapshot } from "../shared/model.ts";
import type { GithubParseCache } from "./scripts/githubReview.ts";
import { createGithubLoader, githubResponseText } from "./scripts/githubLoader.ts";
import { createReviewState, type GithubReviewData } from "./scripts/reviewState.ts";
import { createUnityContextLoader } from "./scripts/githubUnityContext.ts";

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
  let signature = "";
  let deadline = Date.now() + 10000;
  const reviewState = createReviewState();
  const parseCache: GithubParseCache = { files: new Map() };
  const runtime =
    typeof browser !== "undefined"
      ? browser.runtime
      : typeof chrome !== "undefined"
        ? chrome.runtime
        : undefined;
  const unityContext = createUnityContextLoader({
    onFile(file) {
      const current = reviewState.current;
      const context = reviewContext(location.href);
      if (
        !current ||
        !context?.isChangesPage ||
        `${context.key}:${location.pathname}:${location.search}` !== contextKey
      )
        return;
      if (current.files.find((item) => item.filePath === file.filePath)?.rawDiff !== file.rawDiff)
        return;
      const merged = reviewState.merge({ ...current, files: [file], partialListing: true });
      snapshot = { ...snapshot, files: merged.files };
      publish();
    },
    readBlob(html) {
      const page = new DOMParser().parseFromString(html, "text/html");
      const data = page.querySelector(
        'script[type="application/json"][data-target="react-app.embeddedData"]',
      );
      if (!data?.textContent) throw new Error("GitHub source data is unavailable.");
      return JSON.parse(data.textContent) as unknown;
    },
  });
  const loader = createGithubLoader({
    onData(data) {
      const context = reviewContext(location.href);
      if (
        !context?.isChangesPage ||
        `${context.key}:${location.pathname}:${location.search}` !== contextKey
      )
        return;
      accept(data, context);
      publish();
    },
    onProgress(remaining) {
      const context = reviewContext(location.href);
      if (
        snapshot.status === "ready" &&
        context?.isChangesPage &&
        `${context.key}:${location.pathname}:${location.search}` === contextKey
      ) {
        snapshot = {
          ...snapshot,
          preloading: remaining || undefined,
          preloadError: loader.failed
            ? "Some diffs could not be preloaded. They can still load as you browse; Refresh retries."
            : undefined,
        };
        publish();
      }
    },
    async bootstrap(changesUrl, signal) {
      const timeout = AbortSignal.timeout(15_000);
      const response = await fetch(changesUrl, {
        credentials: "same-origin",
        redirect: "error",
        signal: AbortSignal.any([signal, timeout]),
      });
      const html = await githubResponseText(response);
      const page = new DOMParser().parseFromString(html, "text/html");
      return readGithubReview(page, changesUrl);
    },
  });
  function accept(data: GithubReviewData, context: NonNullable<ReturnType<typeof reviewContext>>) {
    const current = reviewState.merge(data);
    snapshot = {
      reviewKey: `${context.key}:${current.comparisonKey}`,
      title: context.title,
      status: "ready",
      files: current.files,
      partialListing: current.partialListing,
      navigation: current.navigation,
      preloading: loader.remaining || undefined,
      preloadError: loader.failed
        ? "Some diffs could not be preloaded. They can still load as you browse; Refresh retries."
        : undefined,
    };
    loader.update(current, context.changesUrl);
  }
  function publish() {
    // GitHub may replace a table without changing its scene data.
    inlineReviews.update(snapshot);
    unityContext.update(
      snapshot.reviewKey,
      snapshot.files,
      snapshot.navigation,
      new Set(
        [...document.querySelectorAll("[data-scenesleuth-inline]")].map((host) =>
          host.getAttribute("data-scenesleuth-inline")!,
        ),
      ),
    );
    const next = JSON.stringify(snapshot);
    if (next === signature) return;
    signature = next;
    if (runtime)
      void runtime.sendMessage({ action: "REVIEW_UPDATED", snapshot }).catch(() => {
        /* The popup is normally closed. */
      });
  }
  function refresh() {
    loader.clear();
    unityContext.clear();
    reviewState.clear();
    parseCache.files.clear();
    signature = "";
    deadline = Date.now() + 10000;
    checkPage();
  }
  function checkPage() {
    const context = reviewContext(location.href);
    const pageKey = context ? `${context.key}:${location.pathname}:${location.search}` : undefined;
    if (pageKey !== contextKey) {
      contextKey = pageKey;
      loader.clear();
      unityContext.clear();
      reviewState.clear();
      parseCache.files.clear();
      parseCache.key = undefined;
      signature = "";
      deadline = Date.now() + 10000;
    }
    if (!context) {
      snapshot = {
        reviewKey: "",
        title: "SceneSleuth",
        status: "error",
        files: [],
        error: "Open a GitHub pull request to review its Godot or Unity files.",
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
        error:
          "Open this pull request's Files changed tab to read its supported scene and asset diffs.",
        changesUrl: context.changesUrl,
      };
      publish();
      return;
    }
    try {
      const data =
        readGithubReview(document, context.changesUrl, parseCache) ?? reviewState.current;
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
        accept(data, context);
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
    pending = window.requestAnimationFrame(() => {
      pending = undefined;
      checkPage();
    });
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
