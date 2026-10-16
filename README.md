# SceneSleuth

Understand Godot scene changes while reviewing a GitHub pull request.

Godot stores scenes in `.tscn` text files. A regular diff shows which lines changed, but working out what those lines mean for a scene can take some digging. SceneSleuth is a browser extension intended to turn those changes into a structured view of nodes, resources, and properties, directly in the review workflow.

The goal is to help Godot developers answer **“What changed in this scene?”** without having to reconstruct the scene from its serialized text or open the project in Godot.

## Where the project stands

SceneSleuth is an early prototype. The current implementation:

- Runs a content script on GitHub pull request pages.
- Looks for `.tscn` file diffs and extracts added and deleted lines from the page.
- Sends per-file addition and deletion counts to a React extension popup.
- Watches for additional diff elements being added to the page.

There is experimental code for parsing scene data and rendering an Inspector-style table. **That richer view is not connected yet:** the call that replaces GitHub's diff is commented out, and the active diff parser returns an empty `changes` array. The popup currently shows filenames and line counts, rather than meaningful scene comparisons.

For example, a future structured view could describe a node's position changing, a resource being added, or a signal connection being removed. These are intended outcomes, not features available today.

## Getting started

You need Node.js 22 (22.12 or later) or Node.js 24+, and pnpm 10.28.1. The pnpm version is pinned in `package.json`; `pnpm-lock.yaml` records dependency versions. Node.js 22.16 is used to check these instructions. If pnpm is not installed, follow the [pnpm installation guide](https://pnpm.io/installation). With Corepack available, `corepack enable` activates the pinned package manager.

```sh
pnpm install --frozen-lockfile
pnpm run build
```

The build writes the popup, content scripts, background script, and manifest to `dist/`. The older `build/` directory contains generated artifacts and is not the output of the current build configuration.

### Load the extension for development

The manifest currently uses `background.scripts`, a [Firefox-supported background configuration](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background). [Chrome Manifest V3 uses `background.service_worker`](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers) instead. Browser compatibility and packaging still need validation; do not treat the current build as a cross-browser release.

For a [Firefox development session](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/):

1. Build the project.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Choose **Load Temporary Add-on** and select `dist/manifest.json`.
4. Open a GitHub pull request with `.tscn` changes and visit **Files changed**. If the page was already open, reload it after loading the extension.
5. Open the SceneSleuth toolbar popup to inspect the detected scene files and their change counts.

After changing extension code, rebuild, reload the temporary add-on, and reload the GitHub page. GitHub's markup may have changed since this prototype was written; see the limitations below if no files are detected. This browser flow still needs end-to-end verification.

### Work on the popup

```sh
pnpm run dev
```

Open `/popup/index.html` on the local URL Vite prints. This is useful for developing the popup's HTML and styles. Its data flow depends on extension APIs and a GitHub tab, so a normal browser page does not exercise the full extension and may show API errors or remain loading.

## Development commands

```sh
pnpm run dev       # Start Vite for local UI development
pnpm run typecheck # Check all popup, content, background, and Vite TypeScript
pnpm run build     # Build all extension entry points into dist/
pnpm run build:check # Verify manifest assets and classic content script syntax
pnpm run lint      # Run Oxlint, including React hooks and accessibility rules
pnpm run fmt       # Format supported source and documentation files with Oxfmt
pnpm run fmt:check # Check formatting without changing files
pnpm run preview   # Serve built files; does not install the extension
pnpm run ui info # Inspect the shadcn React Aria configuration
```

There is no automated test runner configured yet. `test.html` is a saved GitHub diff page used as sample input, not an automated test suite.

The build runs TypeScript 7 project checks before bundling with Vite 8's Rolldown/Oxc toolchain, then checks the manifest's built assets and content script syntax. The app project covers `popup/src/`, `content_script/`, and `background/`; the Node project covers all Vite configurations. Oxlint and Oxfmt replace the previous ESLint setup. The saved `test.html` fixture and generated output are excluded from formatting.

### UI components

Popup primitives use [React Aria Components](https://react-aria.adobe.com/) with shadcn's `aria-vega` configuration and the existing stone color tokens. `pnpm run ui add <component>` runs the pinned shadcn CLI on demand; it downloads CLI tooling with `pnpm dlx` rather than adding it to the extension's runtime dependencies.

Use `Button` with `onPress` for actions and `isDisabled` for its disabled state. Use `LinkButton` with `href` for navigation. Both support refs and React Aria render props. The previous Radix `Slot` and `asChild` API have been removed; use a link component when composing a navigation control. Focus, hover, and disabled styling follows React Aria's state attributes.

## How it fits together

- `content_script/content-script.ts` finds GitHub diff elements, filters scene files, stores parsed results, and exchanges messages with the popup.
- `content_script/scripts/diffParser.ts` extracts filenames, line numbers, and change counts from diff HTML.
- `content_script/scripts/contentParser.ts` and `groupLinesByBrackets.ts` contain the initial scene parsing experiments.
- `content_script/second_try/` contains an alternative parser; it is not wired into the active flow.
- `content_script/scripts/createGodotInspectorTable.ts`, `generateTableRows.ts`, and `replaceDiffWithGodotInspector.ts` contain the unfinished inline view.
- `popup/src/` contains the React UI, styled with Tailwind CSS and React Aria primitives configured through shadcn.
- `public/manifest.json` defines extension permissions and entry points.
- `vite*.config.ts` define separate popup, content script, and background builds.
- `background/background.ts` and `content_script/main.ts` are reserved entry points without runtime behavior.

There is no backend in this repository. The implemented flow reads the GitHub page's DOM and passes data through browser extension messages; it does not fetch complete scene files from a GitHub API.

## Current limitations and useful next work

- **Scene understanding:** consolidate the parser experiments and connect structured results to a review UI. Keep diff additions/deletions separate from Godot object types.
- **Incomplete input:** the parser reads changed lines, not complete before-and-after scenes. Unchanged nodes, property ownership, and referenced resources may be missing. A trustworthy semantic comparison needs that context or an explicit indication that the result is partial.
- **GitHub integration:** selectors depend on GitHub's DOM. Navigation within GitHub, delayed rendering, and repeated processing need testing; scene elements are not currently marked processed while the inline renderer is disabled.
- **Popup feedback:** unsupported pages, missing content scripts, and messaging failures need clear empty or error states instead of indefinite loading.
- **Development foundations:** validate each browser's manifest and add small fixtures and regression tests for the parser and messaging flow.
- **Release polish:** replace the template manifest description, Vite branding, and popup page title before distribution.

## Contributing with an AI agent

Start with [AGENTS.md](AGENTS.md) for repository conventions and verification expectations. Project-local skills live in [`.agents/skills/`](.agents/skills/) and cover extension development, Godot scene diffs, and popup UI work. Their scope and invocation examples are listed in `AGENTS.md`.
