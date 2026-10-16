---
name: scenesleuth-extension
description: Develop or debug SceneSleuth's browser extension integration, including GitHub diff discovery, navigation, runtime messaging, manifests, Vite packaging, and verification of the installed extension. Use when changing extension behavior rather than only scene parsing or popup presentation.
---

# SceneSleuth extension development

Read the root `AGENTS.md` and relevant source before making changes. Resolve paths below from the repository root. This skill supports the existing extension; it does not require migrating to a new extension framework.

## Follow the actual data path

Start with `public/manifest.json`, the matching `vite*.config.ts`, `content_script/content-script.ts`, and the message consumer in `popup/src/App.tsx`. There is currently no background process; the popup talks directly to its tab’s content script. Check these facts again as the project evolves.

Identify the responsible context: page DOM work in the content script, presentation in the popup, and background work only where needed. Keep parsers independent of browser globals. Inspect both sides of a message before changing its shape; prefer a shared discriminated union and runtime checks at message boundaries.

The current protocol uses `GET_REVIEW`, `REFRESH_REVIEW`, `OPEN_REVIEW`, and `REVIEW_UPDATED`. A popup opening after page processing must be able to request the existing snapshot. Push notifications alone do not cover that case. Keep replies and updates scoped to the requested tab and page; ignore unrelated-tab broadcasts and stale responses after navigation.

## GitHub DOM lifecycle

Use observed markup or a fixture to choose selectors. The modern adapter uses `pullRequestsChangesRoute` / `pullRequestsChangesWithRangeRoute` embedded data and `table[aria-label^="Diff for: "]` markup observed on GitHub. These are implementation assumptions, not a GitHub API contract. Do not assume a selector still exists because it appears in `test.html`.

Account for scripts running before or after document load, delayed diff rendering, and navigation without a full page reload. Reset stored results when the review context changes. Define deduplication using file identity and the current review context, not an ever-growing global array.

If an observer changes the subtree it watches, ensure that its own updates do not trigger repeated parsing. Mark or track successful processing separately from whether an inline renderer is enabled. Avoid reparsing every diff for every page mutation. Preserve GitHub review controls and access to the original diff when adding a structured view.

## Packaging and browser compatibility

Build from source with `pnpm run build`; inspect `dist/manifest.json` and every referenced asset. Check the output script format for the declared execution context, not just the existence of a bundle.

Choose browser-specific manifest fields deliberately. The current manifest has no background declaration. If adding background work, Chrome MV3 uses `background.service_worker`; Firefox has separate requirements. Consult the [Chrome service-worker guidance](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers) and [Firefox background manifest reference](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background) when modifying manifests or lifecycle code; check official API documentation for changes to messaging semantics. Preserve the task's browser scope and explain any browser left untested.

Keep permissions and web-accessible resources tied to the implemented feature. Scene text belongs in escaped/text rendering, not executable markup. Do not add a page-to-extension bridge or network relay unless the feature needs one.

## Verify the affected behavior

Use the browser tooling available in the environment and load the built extension when supported. A Vite page with mocked globals cannot establish that injection, permissions, or extension messaging work. If extension loading is unavailable, verify what you can and explicitly report that gap.

Choose checks based on the change:

- A PR with `.tscn` changes yields the expected files and counts; non-scene files are skipped.
- Lazy rendering and repeated processing do not duplicate results.
- PR navigation and switching active tabs do not retain another review's data.
- The popup opens after parsing, closes, and reopens with a fresh snapshot.
- An unsupported page, absent receiver, or extension reload produces a usable state and bounded failures.
- Page, popup, and background consoles do not show new errors from the changed path.

Run the relevant lint/build checks from `AGENTS.md`. Report bundling, type-checking, and runtime results separately. Do not expand a focused fix into a packaging migration or publishing task.
