import type { ReferenceNavigation } from "../../shared/model.ts";
import type { RepositoryTheme } from "../../shared/reviewTheme.ts";
import { reviewContext } from "../../shared/protocol.ts";
import { githubResponseText } from "./githubLoader.ts";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function repositoryTreeTheme(value: unknown, revision: string): RepositoryTheme {
  const payload = record(record(value).payload);
  const route = record(payload.codeViewTreeRoute ?? payload);
  if ((route.path !== "" && route.path !== "/") || record(route.refInfo).currentOid !== revision)
    throw new Error("Repository tree does not match the comparison.");
  const tree = record(route.tree),
    items = tree.items;
  if (
    !Array.isArray(items) ||
    items.length > 10_000 ||
    (typeof tree.totalCount === "number" && tree.totalCount > items.length)
  )
    throw new Error("Repository tree is unavailable.");
  const entries = items.map(record);
  const godot = entries.some(
    (item) => item.path === "project.godot" && item.contentType === "file",
  );
  const unity = ["Assets", "ProjectSettings"].every((path) =>
    entries.some((item) => item.path === path && item.contentType === "directory"),
  );
  return godot && unity ? "mixed" : godot ? "godot" : unity ? "unity" : "github";
}

// A single root-tree read detects the repository even for documentation-only
// PRs. Nested projects use the current comparison's paths; no repository crawl.
export function createRepositoryThemeLoader(options: {
  onTheme: (theme: RepositoryTheme) => void;
  readData: (html: string) => unknown;
  fetch?: typeof fetch;
}) {
  let key = "",
    activeReview = "",
    generation = 0;
  let controller = new AbortController();
  const request = options.fetch ?? fetch;
  function clear() {
    key = "";
    activeReview = "";
    generation++;
    controller.abort();
    controller = new AbortController();
  }
  return {
    clear,
    update(reviewKey: string, navigation?: ReferenceNavigation) {
      if (activeReview !== reviewKey) {
        clear();
        activeReview = reviewKey;
      }
      if (!navigation?.afterRevision || !/^[a-f\d]{40}$/i.test(navigation.afterRevision)) return;
      const context = reviewContext(navigation.changesUrl);
      if (
        !context?.isChangesPage ||
        navigation.repositoryUrl !== `https://github.com${context.key.split("/pull/")[0]}`
      )
        return;
      const next = `${reviewKey}:${navigation.repositoryUrl}:${navigation.afterRevision}`;
      if (key === next) return;
      if (key) clear();
      activeReview = reviewKey;
      key = next;
      const run = generation,
        revision = navigation.afterRevision;
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5_000)]);
      void (async () => {
        try {
          const response = await request(`${navigation.repositoryUrl}/tree/${revision}`, {
            credentials: "same-origin",
            redirect: "error",
            signal,
            headers: { Accept: "text/html" },
          });
          const theme = repositoryTreeTheme(
            options.readData(await githubResponseText(response, 2_000_000)),
            revision,
          );
          if (run === generation && !signal.aborted) options.onTheme(theme);
        } catch {
          /* File evidence remains usable when the root tree is unavailable. */
        }
      })();
    },
  };
}
