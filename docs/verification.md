# Verification record

Development build 0.1.0, checked on 2026-10-16.

## Automated checks

- `pnpm install --frozen-lockfile`: passed with pnpm 10.28.1.
- `pnpm run lint`, `pnpm run fmt:check`, `pnpm run typecheck`: passed.
- `pnpm test`: 21 tests passed using Node’s built-in runner.
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

## Remaining verification

The user loaded SceneSleuth in Chrome. Its real toolbar popup was opened on the private PR, and its outdated-response error state was verified. DevTools confirmed that Chrome was still executing the cached prototype content script (`Custom elements not found on initial load`), while the popup had the current build. Reloading the PR alone did not replace that cached script.

Chrome automation blocks opening `chrome://extensions`. The user must reload the installed extension there, then reload the PR tab, before the following installed-extension checks can be completed:

- Real scene PR: injection, all scene results, delayed file loading, filters, and original-source links.
- Actual toolbar popup messaging, close/reopen, active-tab scoping, and absent receivers.
- Navigation between PRs/comparisons and a real PR without scene changes.
- Page and extension-popup consoles.

Firefox runtime verification also remains outstanding. The build should not be described as a verified cross-browser release.
