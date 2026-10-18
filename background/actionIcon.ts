import { actionIconPaths, actionIconTitle } from "../shared/sceneEye.ts";
import type { EngineTheme } from "../shared/reviewTheme.ts";

interface IconActions {
  setIcon: (details: { tabId: number; path: Record<string, string> }) => Promise<void>;
  setTitle: (details: { tabId: number; title: string }) => Promise<void>;
}
export function createActionIconController(action: IconActions) {
  const tabs = new Map<
    number,
    { desired: EngineTheme; applied?: EngineTheme; pending?: Promise<void>; closed: boolean }
  >();
  function update(tabId: number, theme: EngineTheme): Promise<void> {
    if (!Number.isInteger(tabId) || tabId < 0) return Promise.resolve();
    let state = tabs.get(tabId);
    if (!state) {
      state = { desired: theme, closed: false };
      tabs.set(tabId, state);
    }
    state.desired = theme;
    if (state.pending) return state.pending;
    if (state.applied === theme) return Promise.resolve();
    const current = state;
    current.pending = Promise.resolve()
      .then(async () => {
        while (!current.closed && current.applied !== current.desired) {
          const next = current.desired;
          await action.setIcon({ tabId, path: actionIconPaths(next) });
          if (current.closed) return;
          await action.setTitle({ tabId, title: actionIconTitle(next) });
          current.applied = next;
        }
      })
      .then(
        () => {
          current.pending = undefined;
          // A new request can arrive between the drain and its completion callback.
          if (!current.closed && current.applied !== current.desired)
            return update(tabId, current.desired);
        },
        (error) => {
          current.applied = undefined;
          current.pending = undefined;
          throw error;
        },
      );
    return current.pending;
  }
  return {
    update,
    remove(tabId: number) {
      const state = tabs.get(tabId);
      if (state) state.closed = true;
      tabs.delete(tabId);
    },
  };
}
