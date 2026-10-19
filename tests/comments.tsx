import { useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { createInlineReviews } from "../ui/contentRoot.tsx";
import { observeGithubDiffs, githubTableLines } from "../content_script/scripts/githubDom.ts";
import { reviewDiff } from "../content_script/scripts/diffParser.ts";
import type { ReviewSnapshot } from "../shared/model.ts";
import "./github-theme.css";

const style = document.createElement("style");
style.textContent = `body{padding:24px}#controls{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}button,textarea{font:inherit;color:inherit;background:var(--bgColor-muted);border:1px solid var(--borderColor-default);border-radius:4px;padding:5px 9px}button{cursor:pointer}button:focus-visible,textarea:focus-visible{outline:2px solid var(--fgColor-accent)}[data-diff-header-wrapper]{display:flex;gap:10px;align-items:center;padding:10px;border:1px solid var(--borderColor-default)}[data-diff-header-wrapper] h2{font-size:14px;margin:0 auto 0 0}.border{position:relative;border:1px solid var(--borderColor-default)}table{width:100%;border-collapse:collapse}td{border-bottom:1px solid var(--borderColor-muted);padding:6px}code{white-space:pre-wrap}[data-inline-markers]{padding-top:8px}[data-testid=review-thread],[data-marker-navigation-new-thread]{background:var(--bgColor-default);border:1px solid var(--borderColor-default);border-radius:6px;padding:12px;margin-bottom:6px;box-sizing:border-box;min-width:0}textarea{display:block;box-sizing:border-box;width:100%;margin:8px 0;min-height:80px}[data-inline-markers] h3{font-size:12px;margin:0 0 8px}[data-inline-markers] p{overflow-wrap:anywhere}#native>section{margin-bottom:24px}output{display:block;margin:10px 0}`;
document.head.append(style);
const source = [
  "@@ -1,7 +1,7 @@",
  " [gd_scene format=3]",
  ' [node name="Player" type="Node2D"]',
  "-position = Vector2(1, 2)",
  "+position = Vector2(3, 4)",
  " metadata/data = {",
  '-"speed": 1,',
  '+"speed": 2,',
  ' "ready": true',
  " }",
];
const paths = ["Scenes/player.tscn", "Scenes/enemy.tscn"];
const files = paths.map((path, index) => {
  const lines = index
    ? source.map((s) => s.replace(/Player/g, "Enemy").replace("Vector2(3, 4)", "Vector2(80, 90)"))
    : source;
  const file = reviewDiff(
    `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n${lines.join("\n")}\n`,
  )[0];
  file.reviewUrl = `${location.origin}${location.pathname}#diff-comments-${index}`;
  return file;
});
const snapshot: ReviewSnapshot = {
  reviewKey: "comments:1",
  title: "Native comment fixture",
  status: "ready",
  files,
};
let submitted = 0;
function NativeEditor({ done }: { done: (body?: string) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <div data-marker-navigation-new-thread>
      <h3>GitHub comment editor (synthetic)</h3>
      <textarea
        aria-label="Markdown value"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <button onClick={() => done()}>Cancel</button>{" "}
      <button
        disabled={!draft.trim()}
        onClick={() => {
          submitted++;
          done(draft);
        }}
      >
        Add review comment
      </button>
    </div>
  );
}
function NativeCell({
  text,
  side,
  line,
  index,
}: {
  text: string;
  side: string;
  line: number;
  index: number;
}) {
  const [hover, setHover] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reply, setReply] = useState(false);
  const [thread, setThread] = useState<string[]>(
    line === 3 || (line === 5 && side === "right")
      ? [`${index ? "Enemy" : "Player"} ${side} line ${line} comment`]
      : [],
  );
  return (
    <td
      className="diff-text-cell"
      data-diff-side={side}
      data-line-number={line}
      data-diff-line-key={`b:${line}-l:${side === "left" ? line : "null"}-r:${side === "right" ? line : "null"}`}
      data-line-anchor={`diff-comments-${index}${side === "left" ? "L" : "R"}${line}`}
      tabIndex={-1}
      onMouseEnter={() => setHover(true)}
      onFocus={() => setHover(true)}
    >
      <code className="diff-text">{text}</code>
      {hover && (
        <button data-add-comment-button onClick={() => setEditing(true)}>
          Add comment
        </button>
      )}
      {(thread.length > 0 || editing) && (
        <div data-inline-markers>
          {thread.length > 0 && (
            <div data-testid="review-thread" id={`r-${index}-${side}-${line}`}>
              <h3>
                Reviewer · {side === "left" ? "Before" : "After"} L{line}
              </h3>
              {thread.map((body, i) => (
                <p key={i}>{body}</p>
              ))}
              {reply ? (
                <NativeEditor
                  done={(body) => {
                    if (body) setThread([...thread, body]);
                    setReply(false);
                  }}
                />
              ) : (
                <button onClick={() => setReply(true)}>Write a reply</button>
              )}
            </div>
          )}
          {editing && (
            <NativeEditor
              done={(body) => {
                if (body) setThread([...thread, body]);
                setEditing(false);
              }}
            />
          )}
        </div>
      )}
    </td>
  );
}
function NativeFile({ index }: { index: number }) {
  let before = 1,
    after = 1;
  const lines = index
    ? source.map((s) => s.replace(/Player/g, "Enemy").replace("Vector2(3, 4)", "Vector2(80, 90)"))
    : source;
  return (
    <section aria-label={paths[index]}>
      <div data-diff-header-wrapper>
        <h2>{paths[index]}</h2>
        <button>Ask Copilot</button>
        <label>
          <input type="checkbox" />
          Viewed
        </label>
      </div>
      <div className="border">
        <table aria-label={`Diff for: ${paths[index]}`} data-diff-anchor={`diff-comments-${index}`}>
          <tbody>
            {lines.map((text, i) => {
              if (text.startsWith("@@"))
                return (
                  <tr key={i}>
                    <td className="diff-hunk-cell">{text}</td>
                  </tr>
                );
              const side = text[0] === "-" ? "left" : "right";
              const line = side === "left" ? before : after;
              if (text[0] !== "+") before++;
              if (text[0] !== "-") after++;
              return (
                <tr key={i}>
                  <NativeCell text={text} side={side} line={line} index={index} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
const root = createRoot(document.getElementById("native")!);
flushSync(() =>
  root.render(
    <>
      {paths.map((_, index) => (
        <NativeFile key={index} index={index} />
      ))}
    </>,
  ),
);
const reviews = createInlineReviews();
function reconcile() {
  reviews.update(snapshot);
}
reconcile();
let queued = false;
const observer = observeGithubDiffs(document.getElementById("native")!, () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    reconcile();
  });
});
const controls = document.getElementById("controls")!;
for (const [label, action] of [
  ["Reconcile", reconcile],
  [
    "Verify placement",
    () => {
      let checked = 0;
      for (const table of document.querySelectorAll<HTMLTableElement>(
        "table[data-scenesleuth-comments]",
      )) {
        const host = table.previousElementSibling!;
        for (const marker of table.querySelectorAll<HTMLElement>("[data-ss-comment-projected]")) {
          const cell = marker.closest<HTMLElement>(".diff-text-cell")!;
          const key = `${cell.dataset.diffSide === "left" ? "L" : "R"}${cell.dataset.lineNumber}`;
          const slot = host.shadowRoot!.querySelector(`[data-ss-comment-slot="${key}"]`)!;
          const actual = marker.getBoundingClientRect(),
            expected = slot.getBoundingClientRect();
          if (
            Math.abs(actual.top - expected.top) > 1 ||
            Math.abs(actual.width - expected.width) > 1 ||
            Math.abs(actual.height - expected.height) > 1
          )
            throw new Error(`Comment ${key} is misplaced`);
          checked++;
        }
      }
      result.textContent = `PASS: ${checked} native thread containers match their exact file/side/line slots`;
    },
  ],
  [
    "Light / dark",
    () => {
      document.documentElement.dataset.colorMode =
        document.documentElement.dataset.colorMode === "light" ? "dark" : "light";
    },
  ],
  [
    "Verify source extraction",
    () => {
      const table = document.querySelector("table")!;
      const lines = githubTableLines(table);
      const ok = !lines.some((line) => /comment|reviewer/i.test(line));
      document.getElementById("result")!.textContent = ok
        ? "PASS: comments/editor excluded from scene source"
        : "FAIL: comments leaked into source";
    },
  ],
  [
    "Remove / remount files",
    () => {
      flushSync(() => root.render(null));
      reconcile();
      flushSync(() =>
        root.render(
          <>
            {paths.map((_, index) => (
              <NativeFile key={index} index={index} />
            ))}
          </>,
        ),
      );
      reconcile();
    },
  ],
  [
    "Dispose",
    () => {
      observer.disconnect();
      reviews.dispose();
    },
  ],
] as const) {
  const button = document.createElement("button");
  button.textContent = label;
  button.onclick = action;
  controls.append(button);
}
const result = document.createElement("output");
result.id = "result";
controls.after(result);
Object.assign(window, {
  commentFixture: {
    reviews,
    snapshot,
    reconcile,
    get submitted() {
      return submitted;
    },
  },
});
