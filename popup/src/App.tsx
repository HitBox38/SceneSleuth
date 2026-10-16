import { useEffect, useState } from "react";
import { GitBranch, ArrowUpRight } from "lucide-react";
import { Button } from "./components/ui/button.tsx";
import { LinkButton } from "./components/ui/button.tsx";
import { isReviewSnapshot, reviewContext } from "../../shared/protocol.ts";
import type { ReviewSnapshot } from "../../shared/model.ts";
import { sceneStats } from "../../ui/SceneReview.tsx";
import "../../ui/review.css";

type State =
  | { kind: "loading" | "unsupported" | "error"; message?: string }
  | { kind: "review"; snapshot: ReviewSnapshot; tabId: number };
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "SceneSleuth did not respond. Reload the extension, then reload this GitHub tab and try again.",
              ),
            ),
          5000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export default function App() {
  const [state, setState] = useState<State>(() =>
    typeof browser === "undefined" && (typeof chrome === "undefined" || !chrome.runtime)
      ? {
          kind: "unsupported",
          message:
            "Load SceneSleuth as a browser extension, then open it on a GitHub pull request.",
        }
      : { kind: "loading" },
  );
  const [attempt, setAttempt] = useState(0);
  const runtime =
    typeof browser !== "undefined"
      ? browser
      : typeof chrome !== "undefined" && chrome.runtime
        ? chrome
        : undefined;
  useEffect(() => {
    let cancelled = false;
    let receivedUpdate = false;
    let activeId: number | undefined;
    if (!runtime) return;
    const listener = (message: unknown, sender: { tab?: { id?: number } }) => {
      if (
        !activeId ||
        sender.tab?.id !== activeId ||
        !message ||
        typeof message !== "object" ||
        !("action" in message) ||
        message.action !== "REVIEW_UPDATED" ||
        !("snapshot" in message) ||
        !isReviewSnapshot(message.snapshot)
      )
        return;
      receivedUpdate = true;
      if (!cancelled) setState({ kind: "review", snapshot: message.snapshot, tabId: activeId });
    };
    runtime.runtime.onMessage.addListener(listener);
    void (async () => {
      try {
        const [tab] = await bounded(runtime.tabs.query({ active: true, currentWindow: true }));
        if (cancelled) return;
        if (!tab?.id || !tab.url || !reviewContext(tab.url)) {
          setState({
            kind: "unsupported",
            message: "Open a GitHub pull request to see its Godot scene changes.",
          });
          return;
        }
        activeId = tab.id;
        const snapshot: unknown = await bounded(
          runtime.tabs.sendMessage(tab.id, { action: attempt ? "REFRESH_REVIEW" : "GET_REVIEW" }),
        );
        if (!isReviewSnapshot(snapshot))
          throw new Error(
            "SceneSleuth needs to reconnect. Reload the extension, then reload this GitHub tab and try again.",
          );
        if (!cancelled && !receivedUpdate) setState({ kind: "review", snapshot, tabId: tab.id });
      } catch (error) {
        if (!cancelled && !receivedUpdate)
          setState({
            kind: "error",
            message:
              error instanceof Error
                ? /Receiving end does not exist|Could not establish connection|message port closed|Extension context invalidated/i.test(
                    error.message,
                  )
                  ? "SceneSleuth is not connected to this page. Reload the extension, then reload this GitHub tab and try again."
                  : error.message
                : "Could not connect to this page. Reload it and try again.",
          });
      }
    })();
    return () => {
      cancelled = true;
      runtime.runtime.onMessage.removeListener(listener);
    };
  }, [attempt, runtime]);
  async function openReview() {
    if (state.kind !== "review" || !runtime) return;
    try {
      await bounded(runtime.tabs.sendMessage(state.tabId, { action: "OPEN_REVIEW" }));
      window.close();
    } catch {
      setState({
        kind: "error",
        message: "Could not open the review. Reload the GitHub page and try again.",
      });
    }
  }
  const snapshot = state.kind === "review" ? state.snapshot : undefined;
  const stats = snapshot ? sceneStats(snapshot.files) : undefined;
  return (
    <main className="ss ss-popup">
      <header className="ss-header">
        <div className="ss-brand">
          <span className="ss-logo">
            <GitBranch size={19} />
          </span>
          <div>
            <strong>SceneSleuth</strong>
            <p>See the scene behind the diff.</p>
          </div>
        </div>
      </header>
      <div className="ss-popup-body">
        {state.kind === "loading" && (
          <output className="ss-muted">Connecting to this review…</output>
        )}
        {state.kind === "unsupported" && (
          <>
            <h1>Ready for a scene review</h1>
            <p className="ss-muted">{state.message}</p>
          </>
        )}
        {(state.kind === "error" || snapshot?.status === "error") && (
          <div role="alert">
            <h1>Couldn’t read this review</h1>
            <p className="ss-muted">{state.kind === "error" ? state.message : snapshot?.error}</p>
            {snapshot?.changesUrl && (
              <LinkButton className="ss-button" href={snapshot.changesUrl} target="_blank">
                Open Files changed
              </LinkButton>
            )}
            <Button className="ss-button" onPress={() => setAttempt((value) => value + 1)}>
              Try again
            </Button>
          </div>
        )}
        {snapshot?.status === "loading" && (
          <output className="ss-muted">Reading scene changes…</output>
        )}
        {snapshot?.status === "ready" && (
          <>
            <h1>{snapshot.title}</h1>
            {snapshot.files.length ? (
              <>
                <p className="ss-muted" style={{ marginBottom: 16 }}>
                  {snapshot.files.length} {snapshot.partialListing ? "loaded scene" : "scene"}{" "}
                  {snapshot.files.length === 1 ? "file" : "files"} changed
                </p>
                {snapshot.partialListing && (
                  <p className="ss-muted" style={{ marginBottom: 16 }}>
                    Showing scenes loaded by GitHub. More files may appear as you browse.
                  </p>
                )}
                <div className="ss-stats">
                  <span>
                    <strong>{stats?.nodes}</strong> nodes
                  </span>
                  <span>
                    <strong>{stats?.resources}</strong> resources
                  </span>
                  <span>
                    <strong>{stats?.signals}</strong> signals
                  </span>
                </div>
                {snapshot.files.map((file) => (
                  <div key={file.filePath} className="ss-popup-file">
                    {file.filePath}
                    <span>
                      {file.pending
                        ? "Waiting for GitHub to load this diff"
                        : `${file.changes.length} changed sections · +${file.additions} −${file.deletions}`}
                    </span>
                  </div>
                ))}
                <Button
                  className="ss-button"
                  onPress={() => {
                    void openReview();
                  }}
                >
                  Go to scene changes <ArrowUpRight size={14} />
                </Button>
              </>
            ) : (
              <p className="ss-muted">
                {snapshot.partialListing
                  ? "No loaded .tscn diffs found. GitHub may load more files as you browse."
                  : "No .tscn files changed in this pull request."}
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
