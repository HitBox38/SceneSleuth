# Verification record

Development build 0.1.0, checked on 2026-10-16.

## Automated checks

- `pnpm install --frozen-lockfile`: passed with pnpm 10.28.1.
- `pnpm run lint`, `pnpm run fmt:check`, `pnpm run typecheck`: passed.
- `pnpm test`: 23 tests passed using Node’s built-in runner.
- `pnpm run build`: popup and classic IIFE content script built; manifest asset/syntax checks passed.

Node 22 prints an experimental TypeScript-stripping warning. The content build reports two upstream Lucide `use client` directive warnings; this bundle runs entirely in the client. Neither warning causes a check failure.

The engine was also checked against a real private Godot PR through authenticated GitHub CLI reads. It found four scenes: three complete added-file patches and one partial modified scene. The modified scene’s 48 additions and one deletion matched GitHub, with expected node/property changes and no duplicate section identities. Private source was not added to the repository.

The project declares Godot 4.3; parsing conventions were checked against its [TSCN documentation](https://docs.godotengine.org/en/4.3/contributing/development/file_formats/tscn.html), including section ownership, parent paths, semicolon comments, and insignificant whitespace outside strings.

## Browser checks completed

Chrome was signed into GitHub. The real PR’s current embedded-data schema and lazily rendered diff table attributes were inspected to implement the adapter. The private `.diff` download failed in the shared browser, so the shipping loader uses page data and DOM text without network requests.

On `/tests/browser.html`:

- Unified and split synthetic DOM rows produce the same structured changes, counts, and source lines.
- Search filters changed nodes/properties.
- Loading, empty, and error states display; retry restores the review.
- HTML-like scene values appear as text, with no image elements created.
- At 360 px width, document width stays 360 px without horizontal page overflow.
- The checked Chrome fixture console contains no errors or warnings.

On `/popup/index.html` as a normal Chrome web page, the popup displays extension setup guidance instead of waiting for unavailable runtime APIs.

These fixture checks are separate from testing an installed extension.

## Installed Chrome checks

The user loaded and reloaded the unpacked extension. The first attempt exposed Chrome’s cached prototype content script while the popup had the newer build. Reloading the extension, then the PR tab, resolved that mismatch.

On the private Godot PR with four scenes:

- The installed panel reports 21 node changes, 18 resource changes, and 43 changed sections. Per-file section counts are 9, 11, 6, and 17, matching the engine assertions.
- The three new scenes are marked complete. The modified scene remains partial, with 48 added lines and one deletion.
- The modified scene initially appears pending and later updates to 17 sections when GitHub renders its delayed diff.
- Repeated refreshes retain one root, four files, and 43 sections.
- Search finds the expected node/property changes. Pointer and keyboard filters select 21 nodes or 18 resources.
- Launcher, close, refresh, and popup-to-panel actions work.
- Source links reach the correct original diff file. GitHub normalized the tested line fragment to its file anchor; exact line highlighting is not established.
- The checked page consoles have no errors or warnings. The real popup’s console was opened through Chrome’s Inspect action and contained zero messages.

The shadow-root checks found that React Aria’s press handling needed its `enableShadowDOM()` opt-in from `@react-stately/flags`. This is enabled before mounting the inspector. The development fixture now mounts the actual shadow-root panel as well as the standalone inspector, and checks included pointer activation, keyboard activation, filtering, close, and reopen. See the upstream [shadow-DOM press report](https://github.com/adobe/react-spectrum/issues/10051) and [enablement example](https://github.com/adobe/react-spectrum/issues/10330).

The real popup was opened, closed, and reopened on two Godot PR tabs. It showed four scenes for one and only the other PR’s two scenes when switching tabs. Both page snapshots stayed independent. The popup also correctly displayed unsupported-page guidance on the repository PR list.

A public [TypeScript PR](https://github.com/microsoft/TypeScript/pull/64845) provided the no-scene case. Its files were checked through the GitHub API; none were `.tscn`. Both the installed panel and real toolbar popup displayed the empty state without retaining Godot scene results. All PR use was read-only.

## Navigation and selected-commit checks

Testing GitHub’s PR-list → PR navigation exposed a manifest injection gap: a script registered only on PR URLs cannot observe navigation that starts on a non-PR document. The manifest now starts the content script on GitHub, while `reviewContext` gates scene extraction and inspector creation to PRs.

Selecting an individual commit also exposed GitHub’s `pullRequestsChangesWithRangeRoute` payload. The adapter now accepts it, and source URLs preserve the selected range and query parameters. Two focused regressions cover these data contracts.

After the user reloaded the extension to register the updated manifest, a fresh Chrome tab opened on the repository PR list with no inspector root. Clicking the four-scene PR created the launcher on its conversation page. Opening Files changed then displayed all four scenes, 21 node changes, 18 resource changes, and 43 sections, with one inspector root.

GitHub’s commit selector was used to review the first commit. The inspector updated to two scenes (`Scenes/base_enemy.tscn` and `main.tscn`), four node changes, and four resource changes. Source links retained the selected commit in their URLs. Returning to All commits restored four scenes and the original counts without duplicate roots or stale results. The checked page console contained no errors or warnings.

These changes build and pass all checks. The source-link limitation noted above remains: exact GitHub line highlighting was not established.

Firefox runtime verification remains outstanding. The build should not be described as a verified cross-browser release.
