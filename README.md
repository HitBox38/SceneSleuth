# SceneSleuth

**See the scene behind the diff.**

SceneSleuth helps Godot developers review `.tscn` changes in GitHub pull requests. Instead of reconstructing a scene from serialized lines, you can inspect changed nodes, resources, properties, and signal connections directly in each scene file’s diff area.

The goal is to answer **“What changed in this scene?”** without opening the project in Godot.

## What you can do

Open a pull request’s **Files changed** tab. SceneSleuth automatically replaces each loaded `.tscn` diff body with a structured scene review. GitHub’s file header and review controls stay in place. The toolbar popup summarizes the current tab; **Go to scene changes** scrolls to an inline review.

- Browse scene files and their changed sections, with node paths and Godot classes.
- Compare property values before and after, including source line numbers.
- Filter nodes, resources, or signals, and search names, properties, and values.
- Expand resources and inspect the original patch text when you need more detail.
- Switch between **Scene** and **Original diff** independently for each file using the control in GitHub’s file header, between Copilot and Viewed. The scene body starts directly with its filters and search, without an extra brand or counts row. Use the original view for GitHub line comments; source-line links reveal that view automatically.
- Each inline view shows the scene’s own settings, nodes, properties, embedded resources, and signals. Referenced script, image, and scene files are not displayed as separate cards. References remain readable as property values, and their declarations remain in **Original diff**. When GitHub reuses a diff table for another file, SceneSleuth replaces the old view rather than carrying its values over.
- Keep GitHub’s file navigation, Viewed checkboxes, and review controls. Non-scene files keep their original diffs, and SceneSleuth never submits reviews.

Private repositories work through your existing GitHub sign-in. SceneSleuth reads the current page’s review data and rendered diff tables. There is no backend, API token, analytics, or external scene upload.

The content script starts on GitHub pages so it can detect GitHub’s navigation into a PR without a full reload. It reads scene review data and displays its UI only on PR pages.

## Important limits

This is an early development build, not a published extension.

**A diff is not a complete scene.** Modified scenes are marked **Diff context only**. A missing value means that value is absent from the available hunk, not necessarily absent from the scene. If a section header is outside the hunk, changes appear under **Unresolved scene context** rather than being assigned to a guessed node. Only complete added/deleted file patches receive a complete-context label.

GitHub loads some file diffs lazily. Those scenes appear as waiting for text in the toolbar popup. Select the file in GitHub and use its load control if needed. SceneSleuth replaces the diff body once its table and scene text are available, and retains loaded results within the current review. Summary counts for nodes/resources/signals cover parsed text only. If parsing is unavailable, GitHub’s original diff stays visible.

During navigation without a page reload, GitHub can retain the initial page’s embedded data. SceneSleuth rejects data from a different route and reads the current rendered tables instead. In that case the popup labels its results as **loaded scenes**, since more files may appear as you browse. Those tables provide diff context only; they do not establish complete scene contents or file creation/rename metadata.

The adapter targets GitHub’s modern **Files changed** layout. GitHub’s markup and embedded data are not a stable public API; unsupported layouts produce a recoverable message. Very large or GitHub-limited diffs may remain partial. There is no full scene preview, inherited-scene expansion, Godot execution, or speculative matching of renamed nodes/resource identifiers. Values such as constructors and references remain readable source text rather than evaluated objects.

## Install locally

You need Node.js 22.12+ or 24+, and **pnpm 10.28.1**, pinned in `package.json`. With Corepack available, `corepack enable` activates the pinned package manager. See [pnpm installation](https://pnpm.io/installation) if needed.

```sh
pnpm install --frozen-lockfile
pnpm run build
```

The build writes the complete extension to `dist/`. The older `build/` directory is not used.

In Chrome:

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this project’s `dist/` folder.
3. Open a GitHub PR, visit **Files changed**, and reload the page if it was already open.
4. Select a `.tscn` file in GitHub’s file list. Its diff body shows the scene review; **Original diff** restores GitHub’s text view.

After editing code, rebuild, reload the extension in `chrome://extensions`, and reload the GitHub page. Chrome can keep an older registered content script even while the popup reads newer files from `dist/`. If the popup reports an unexpected response, reload **the extension first**, then reload the PR tab; refreshing the page alone may keep running the old script.

The manifest uses Manifest V3 without a background process. Firefox can load `dist/manifest.json` through [temporary add-on debugging](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/), but Firefox runtime compatibility still needs separate verification.

## Development

```sh
pnpm run dev         # Local popup development at /popup/index.html
pnpm test            # Focused parser, patch, and GitHub-data regression tests
pnpm run typecheck   # TypeScript 7 checks for source, tests, and Vite configs
pnpm run lint        # Oxlint, including React and accessibility checks
pnpm run fmt         # Format with Oxfmt
pnpm run fmt:check   # Check formatting
pnpm run build       # Type-check, bundle, and verify manifest assets
pnpm run preview     # Serve built pages; does not install the extension
pnpm run ui info     # Inspect the pinned shadcn React Aria configuration
```

The tests use Node’s built-in test runner and TypeScript stripping; Node 22 may print an experimental warning. No separate test framework is installed. `test.html` is an older captured GitHub fixture, not the live markup contract. Committed regression fixtures are synthetic; do not add private game source to this repository.

The standalone popup displays setup guidance when extension APIs are absent. It does not fabricate review data. Actual injection, permissions, messaging, navigation, and popup reopening require a loaded extension.

For repeatable UI checks, open `/tests/browser.html` on the Vite development server. The synthetic inline fixture mounts the actual shadow-root review beside a preserved source table and file header. Exercise the view toggle, keyboard controls, filters, search, repeated processing, table remounts, delayed files, and cleanup with its controls. A standalone inspector below it covers loading, empty, and error states. The fixture is excluded from the production build and does not establish installed-extension integration.

### Source map

- `content_script/content-script.ts`: page lifecycle, review cache, and popup messaging.
- `content_script/scripts/githubReview.ts`: normalize GitHub’s embedded review data.
- `content_script/scripts/githubDom.ts`: collect additionally rendered diff tables.
- `content_script/scripts/diffParser.ts`: unified patches, hunk boundaries, and source lines.
- `content_script/scripts/contentParser.ts`: scene sections, lexical values, identities, and comparisons.
- `shared/`: review models and the `GET_REVIEW` / `REFRESH_REVIEW` / `OPEN_REVIEW` protocol.
- `ui/`: shared review presentation and per-file shadow-root mounting, original-diff toggles, and cleanup.
- `popup/src/`: React toolbar popup and React Aria primitives.
- `tests/`: focused regression coverage with Node’s built-in runner.
- `public/manifest.json`: permissions and entry points.
- `vite*.config.ts`, `scripts/check-build.mjs`: popup and classic content-script packaging.

The stack is TypeScript 7, React, Vite 8, Tailwind CSS, and React Aria Components. Oxlint/Oxfmt handle linting/formatting. `components.json` selects shadcn’s `aria-vega` style. Use `pnpm run ui add <component>` for new Aria primitives. Actions use `Button` with `onPress`/`isDisabled`; navigation uses `LinkButton` with `href`.

See the [verification record](docs/verification.md) for completed checks and remaining installed-extension/browser coverage.

## Working with an agent

Read [AGENTS.md](AGENTS.md) for conventions and verification expectations. Project-local skills in [`.agents/skills/`](.agents/skills/) cover extension development, Godot scene diffs, and popup presentation.
