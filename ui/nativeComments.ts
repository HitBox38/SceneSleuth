import { commentAnchor, commentAnchorKey, type CommentAnchor } from "../shared/reviewComments.ts";
import type { ReviewComments } from "./ReviewComments.tsx";

// Native React nodes stay under their original parents. Only layout changes:
// GitHub still owns editing, Markdown, replies, drafts, and posting the review.
export const nativeCommentStyles = `
table[data-scenesleuth-comments] {display:none!important;position:relative!important;height:0!important;min-height:0!important;overflow:visible!important;visibility:hidden;border:0!important;}
table[data-scenesleuth-comments]:has([data-inline-markers]) {display:block!important;}
table[data-scenesleuth-comments] > :is(tbody,tfoot),table[data-scenesleuth-comments] > :is(tbody,tfoot) > tr,table[data-scenesleuth-comments] > tr,table[data-scenesleuth-comments] > :is(tbody,tfoot) > tr > td,table[data-scenesleuth-comments] > tr > td {display:contents!important;position:static!important;}
table[data-scenesleuth-comments] > :is(thead,colgroup),table[data-scenesleuth-comments] :is(.diff-hunk-cell,.new-diff-line-number,.diff-text) {display:none!important;}
table[data-scenesleuth-comments] .diff-text-cell > :not([data-inline-markers]) {display:none!important;}
table[data-scenesleuth-comments] [data-inline-markers] {display:none!important;}
table[data-scenesleuth-comments] [data-inline-markers][data-ss-comment-projected] {display:block!important;visibility:visible;position:absolute!important;top:var(--ss-comment-top)!important;left:var(--ss-comment-left)!important;width:var(--ss-comment-width)!important;margin:0!important;padding:0!important;z-index:1;}
`;

export function createNativeComments(
  table: HTMLTableElement,
  host: HTMLElement,
  onChange: () => void,
  fallback: (anchor: CommentAnchor) => void,
) {
  const doc = table.ownerDocument;
  const win = doc.defaultView!;
  let active = false;
  let disposed = false;
  let frame: number | undefined;
  let pending = 0;
  let supported = true;
  const markers = new Map<string, HTMLElement>();
  const resize = new ResizeObserver(schedule);
  resize.observe(host);
  const shadowObserver = new MutationObserver(schedule);
  shadowObserver.observe(host.shadowRoot!, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["open"],
  });
  host.shadowRoot!.addEventListener("toggle", schedule, true);
  function schedule() {
    if (disposed || frame !== undefined) return;
    frame = win.requestAnimationFrame(() => {
      frame = undefined;
      layout();
    });
  }
  function cellFor(anchor: CommentAnchor) {
    return table.querySelector<HTMLElement>(
      `.diff-text-cell[data-diff-side="${anchor.side === "before" ? "left" : "right"}"][data-line-number="${anchor.line}"]`,
    );
  }
  function layout() {
    if (!active || disposed || !table.isConnected || !host.isConnected) return;
    const shadow = host.shadowRoot!;
    const placements: { marker: HTMLElement; slot: HTMLElement }[] = [];
    for (const [key, marker] of markers) {
      const slot = shadow.querySelector<HTMLElement>(`[data-ss-comment-slot="${key}"]`);
      if (!slot || !slot.getClientRects().length) {
        marker.removeAttribute("data-ss-comment-projected");
        continue;
      }
      marker.setAttribute("data-ss-comment-projected", "");
      marker.style.setProperty("--ss-comment-width", `${slot.getBoundingClientRect().width}px`);
      const height = Math.ceil(marker.getBoundingClientRect().height);
      const value = `${height}px`;
      if (slot.style.height !== value) slot.style.height = value;
      placements.push({ marker, slot });
    }
    // Slot heights must all be committed before measuring their final positions.
    const origin = table.getBoundingClientRect();
    for (const { marker, slot } of placements) {
      const rect = slot.getBoundingClientRect();
      marker.style.setProperty("--ss-comment-top", `${rect.top - origin.top}px`);
      marker.style.setProperty("--ss-comment-left", `${rect.left - origin.left}px`);
    }
  }
  async function add(anchor: CommentAnchor) {
    const attempt = ++pending;
    const cell = cellFor(anchor);
    if (!cell) {
      fallback(anchor);
      return;
    }
    const existing = cell.querySelector<HTMLTextAreaElement>("textarea");
    if (existing) {
      existing.focus({ preventScroll: true });
      return;
    }
    // GitHub mounts its Add comment button on hover/focus, rather than for every row.
    cell.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: null }));
    cell.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await new Promise<void>((resolve) => win.requestAnimationFrame(() => resolve()));
    if (disposed || attempt !== pending || !cell.isConnected) return;
    const button = cell.querySelector<HTMLButtonElement>("button[data-add-comment-button]");
    if (!button || button.disabled) {
      fallback(anchor);
      return;
    }
    button.click();
    // Reconcile even if GitHub only changes its editor, without changing the patch.
    onChange();
    schedule();
  }
  return {
    get supported() {
      return supported;
    },
    read(): ReviewComments {
      supported = true;
      const available: string[] = [];
      for (const cell of table.querySelectorAll(
        ".diff-text-cell[data-diff-side][data-line-number]",
      )) {
        const anchor = commentAnchor(
          cell.getAttribute("data-diff-side"),
          cell.getAttribute("data-line-number"),
        );
        if (anchor) available.push(commentAnchorKey(anchor));
      }
      for (const marker of markers.values()) {
        resize.unobserve(marker);
        if (!marker.isConnected) marker.removeAttribute("data-ss-comment-projected");
      }
      markers.clear();
      const anchors: CommentAnchor[] = [];
      for (const marker of table.querySelectorAll<HTMLElement>("[data-inline-markers]")) {
        const cell = marker.closest(".diff-text-cell");
        if (!cell || cell.closest("table") !== table) {
          supported = false;
          continue;
        }
        const anchor = commentAnchor(
          cell.getAttribute("data-diff-side"),
          cell.getAttribute("data-line-number"),
        );
        if (!anchor) {
          supported = false;
          continue;
        }
        const key = commentAnchorKey(anchor);
        if (markers.has(key)) {
          supported = false;
          continue;
        }
        markers.set(key, marker);
        resize.observe(marker);
        anchors.push(anchor);
      }
      return {
        anchors,
        available: [...new Set(available)],
        add: (anchor) => {
          void add(anchor);
        },
      };
    },
    show(structured: boolean) {
      active = structured;
      table.toggleAttribute("data-scenesleuth-comments", structured);
      if (structured) schedule();
    },
    layout,
    dispose() {
      disposed = true;
      pending++;
      if (frame !== undefined) win.cancelAnimationFrame(frame);
      resize.disconnect();
      shadowObserver.disconnect();
      host.shadowRoot!.removeEventListener("toggle", schedule, true);
      table.removeAttribute("data-scenesleuth-comments");
      for (const marker of markers.values()) {
        marker.removeAttribute("data-ss-comment-projected");
        for (const name of ["top", "left", "width"])
          marker.style.removeProperty(`--ss-comment-${name}`);
      }
    },
  };
}
