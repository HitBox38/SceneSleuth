import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { enableShadowDOM } from "@react-stately/flags";
import { InlineSceneReview, InlineViewSwitch } from "./SceneReview.tsx";
import styles from "./review.css?inline";
import type { ReviewSnapshot, SceneReview, ReferenceNavigation } from "../shared/model.ts";
import { reviewViewLabel } from "../shared/fileTypes.ts";

class ReviewBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? (
      <p className="ss ss-padding" role="alert">
        Scene review unavailable. GitHub’s original diff is shown below.
      </p>
    ) : (
      this.props.children
    );
  }
}

// Keep GitHub's table in place so extraction, line comments, and React updates
// continue to work. Add the view switch beside GitHub's existing Viewed control.
export function createInlineReviews(doc: Document = document) {
  enableShadowDOM();
  const entries = new Map<HTMLTableElement, ReturnType<typeof mount>>();
  const originalFiles = new Map<string, boolean>();
  let reviewKey = "";
  let navigation: ReferenceNavigation | undefined;
  function switchAnchor(table: HTMLTableElement) {
    const header = table.closest('[role="region"]')?.querySelector("[data-diff-header-wrapper]");
    const viewed = header?.querySelector(
      'button[aria-label="Not Viewed"], button[aria-label="Viewed"], input[type="checkbox"]',
    );
    return viewed?.closest("label") ?? viewed;
  }
  function isLineHash(table: HTMLTableElement, hash: string) {
    const anchor = table.getAttribute("data-diff-anchor");
    return (
      !!anchor &&
      hash.startsWith(`#${anchor}`) &&
      /^[LR]\d+(?:-.*)?$/.test(hash.slice(anchor.length + 1))
    );
  }

  function mount(table: HTMLTableElement, initial: SceneReview, anchor: Element) {
    const host = doc.createElement("div");
    host.setAttribute("data-scenesleuth-inline", initial.filePath);
    host.tabIndex = -1;
    host.style.cssText = "display:block;min-width:0;scroll-margin-top:100px;";
    const shadow = host.attachShadow({ mode: "open" });
    const style = doc.createElement("style");
    style.textContent = `:host{all:initial;display:block;min-width:0;color-scheme:inherit}${styles}`;
    const target = doc.createElement("div");
    shadow.append(style, target);
    table.before(host);
    const root = createRoot(target);
    const switchHost = doc.createElement("span");
    switchHost.setAttribute("data-scenesleuth-switch", initial.filePath);
    switchHost.style.cssText = "display:inline-flex;flex-shrink:0;vertical-align:middle;";
    const switchShadow = switchHost.attachShadow({ mode: "open" });
    const switchStyle = doc.createElement("style");
    switchStyle.textContent = `:host{all:initial;display:inline-flex;flex-shrink:0;color-scheme:inherit}${styles}`;
    const switchTarget = doc.createElement("div");
    switchShadow.append(switchStyle, switchTarget);
    anchor.before(switchHost);
    const switchRoot = createRoot(switchTarget);
    const display = table.style.getPropertyValue("display");
    const priority = table.style.getPropertyPriority("display");
    let file = initial;
    let signature = "";
    let failed = false;

    function showTable(show: boolean) {
      if (show) {
        if (display) table.style.setProperty("display", display, priority);
        else table.style.removeProperty("display");
      } else table.style.setProperty("display", "none", "important");
    }
    function setOriginal(original: boolean) {
      originalFiles.set(file.filePath, original);
      render();
    }
    function render() {
      if (!originalFiles.has(file.filePath))
        originalFiles.set(file.filePath, isLineHash(table, doc.location.hash));
      const original = originalFiles.get(file.filePath)!;
      showTable(original || failed);
      const next = JSON.stringify([file, original, navigation]);
      if (signature === next) return;
      signature = next;
      root.render(
        <ReviewBoundary
          onError={() => {
            failed = true;
            showTable(true);
          }}
        >
          <InlineSceneReview
            key={file.filePath}
            file={file}
            original={original}
            navigation={navigation}
          />
        </ReviewBoundary>,
      );
      switchRoot.render(
        <InlineViewSwitch
          filePath={file.filePath}
          viewLabel={reviewViewLabel(file)}
          original={original}
          onOriginal={setOriginal}
        />,
      );
    }
    render();
    return {
      host,
      switchHost,
      get file() {
        return file;
      },
      update(next: SceneReview) {
        file = next;
        render();
      },
      setOriginal,
      dispose() {
        showTable(true);
        root.unmount();
        switchRoot.unmount();
        host.remove();
        switchHost.remove();
      },
    };
  }
  function clear() {
    for (const entry of entries.values()) entry.dispose();
    entries.clear();
  }
  function revealLine(hash: string) {
    for (const [table, entry] of entries) {
      if (isLineHash(table, hash)) entry.setOriginal(true);
    }
  }
  function onHashChange() {
    revealLine(doc.location.hash);
  }
  function onSourceClick(event: MouseEvent) {
    const link = event.composedPath().find((node) => node instanceof HTMLAnchorElement);
    if (!(link instanceof HTMLAnchorElement)) return;
    const url = new URL(link.href, doc.location.href);
    if (
      url.origin === doc.location.origin &&
      url.pathname === doc.location.pathname &&
      url.search === doc.location.search
    ) {
      revealLine(url.hash);
      if (
        link.dataset.scenesleuthFileReference === "diff" &&
        event.button === 0 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey
      ) {
        // GitHub's tree handler loads/scrolls virtualized diffs that do not yet
        // have a DOM anchor. Preserve native modified-click/new-tab behavior.
        const native = [
          ...doc.querySelectorAll<HTMLAnchorElement>('[role="treeitem"] a[href]'),
        ].find((anchor) => new URL(anchor.href, doc.location.href).href === url.href);
        if (native) {
          event.preventDefault();
          native.click();
        }
      }
    }
  }
  doc.addEventListener("click", onSourceClick, true);
  doc.defaultView?.addEventListener("hashchange", onHashChange);

  return {
    update(snapshot: ReviewSnapshot) {
      navigation = snapshot.navigation;
      if (reviewKey !== snapshot.reviewKey) {
        clear();
        originalFiles.clear();
        reviewKey = snapshot.reviewKey;
      }
      const files = new Map(
        snapshot.status === "ready"
          ? snapshot.files.filter((file) => !file.pending).map((file) => [file.filePath, file])
          : [],
      );
      for (const [table, entry] of entries) {
        if (
          !table.isConnected ||
          table.getAttribute("aria-label") !== `Diff for: ${entry.file.filePath}` ||
          !entry.host.isConnected ||
          entry.host.parentElement !== table.parentElement ||
          entry.host.nextElementSibling !== table ||
          !entry.switchHost.isConnected ||
          entry.switchHost.nextElementSibling !== switchAnchor(table) ||
          !files.has(entry.file.filePath)
        ) {
          entry.dispose();
          entries.delete(table);
        }
      }
      for (const table of doc.querySelectorAll<HTMLTableElement>(
        'table[aria-label^="Diff for: "]',
      )) {
        const file = files.get(table.getAttribute("aria-label")?.slice(10) ?? "");
        if (!file) continue;
        const entry = entries.get(table);
        if (entry) entry.update(file);
        else {
          const anchor = switchAnchor(table);
          if (anchor) entries.set(table, mount(table, file, anchor));
        }
      }
    },
    open() {
      const entry =
        [...entries.values()].find(
          (item) =>
            item.file.reviewUrl &&
            new URL(item.file.reviewUrl, doc.location.href).hash === doc.location.hash,
        ) ?? entries.values().next().value;
      if (!entry) return;
      entry.setOriginal(false);
      entry.host.scrollIntoView({ block: "start" });
      entry.host.focus({ preventScroll: true });
    },
    dispose() {
      clear();
      originalFiles.clear();
      doc.removeEventListener("click", onSourceClick, true);
      doc.defaultView?.removeEventListener("hashchange", onHashChange);
    },
  };
}
