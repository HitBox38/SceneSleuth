import { createActionIconController } from "./actionIcon.ts";
import { iconThemeRequest } from "../shared/iconProtocol.ts";
import { reviewContext } from "../shared/protocol.ts";

const api = typeof browser !== "undefined" ? browser : chrome;
const icons = createActionIconController({
  async setIcon(details) {
    await api.action.setIcon(details);
  },
  async setTitle(details) {
    await api.action.setTitle(details);
  },
});
api.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const request = iconThemeRequest(message, sender, api.runtime.id);
  if (!request) return;
  void icons
    .update(request.tabId, request.theme)
    .then(() => sendResponse({ iconUpdated: true }))
    .catch(() => sendResponse({ iconUpdated: false }));
  return true;
});
api.tabs.onUpdated.addListener((tabId, change) => {
  let reset = change.status === "loading";
  if (change.url) {
    try {
      reset ||= !reviewContext(change.url)?.isChangesPage;
    } catch {
      reset = true;
    }
  }
  if (reset)
    void icons.update(tabId, "github").catch(() => {
      /* The tab may have closed. */
    });
});
api.tabs.onRemoved.addListener((tabId) => icons.remove(tabId));
