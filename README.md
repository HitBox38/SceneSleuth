# SceneSleuth

**See the scene behind the diff.**

SceneSleuth helps Godot developers review `.tscn` changes in GitHub pull requests. Instead of reconstructing a scene from serialized lines, you can inspect changed nodes, resources, properties, and signal connections in a structured panel beside the original review.

The goal is to answer **“What changed in this scene?”** without opening the project in Godot.

## What you can do

Open a pull request’s **Files changed** tab, then click **SceneSleuth** in the bottom-right corner. The toolbar popup also summarizes the current tab and opens the review panel.

- Browse scene files and their changed sections, with node paths and Godot classes.
- Compare property values before and after, including source line numbers.
- Filter nodes, resources, or signals, and search names, properties, and values.
- Expand resources and inspect the original patch text when you need more detail.
- Keep reviewing with GitHub’s original controls; SceneSleuth does not replace its diff or submit reviews.

Private repositories work through your existing GitHub sign-in. SceneSleuth reads the current page’s review data and rendered diff tables. There is no backend, API token, analytics, or external scene upload.

## Important limits

This is an early development build, not a published extension.

**A diff is not a complete scene.** Modified scenes are marked **Diff context only**. A missing value means that value is absent from the available hunk, not necessarily absent from the scene. If a section header is outside the hunk, changes appear under **Unresolved scene context** rather than being assigned to a guessed node. Only complete added/deleted file patches receive a complete-context label.

GitHub loads some file diffs lazily. Those scenes appear as waiting for text; use **Load original scene diff** to open them. SceneSleuth updates when GitHub renders their lines and retains loaded results within the current review. Summary counts for nodes/resources/signals cover parsed text only.

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
4. Click the floating SceneSleuth button or open the extension’s toolbar popup.

After editing code, rebuild, reload the extension in `chrome://extensions`, and reload the GitHub page.

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

For repeatable UI checks, open `/tests/browser.html` on the Vite development server. This synthetic fixture checks unified/split DOM extraction and lets you exercise ready, loading, empty, and error states, filtering, and untrusted scene text. It is excluded from the production build and does not establish extension integration.

### Source map

- `content_script/content-script.ts`: page lifecycle, review cache, and popup messaging.
- `content_script/scripts/githubReview.ts`: normalize GitHub’s embedded review data.
- `content_script/scripts/githubDom.ts`: collect additionally rendered diff tables.
- `content_script/scripts/diffParser.ts`: unified patches, hunk boundaries, and source lines.
- `content_script/scripts/contentParser.ts`: scene sections, lexical values, identities, and comparisons.
- `shared/`: review models and the `GET_REVIEW` / `REFRESH_REVIEW` / `OPEN_REVIEW` protocol.
- `ui/`: shared review presentation and the shadow-root panel.
- `popup/src/`: React toolbar popup and React Aria primitives.
- `tests/`: focused regression coverage with Node’s built-in runner.
- `public/manifest.json`: permissions and entry points.
- `vite*.config.ts`, `scripts/check-build.mjs`: popup and classic content-script packaging.

The stack is TypeScript 7, React, Vite 8, Tailwind CSS, and React Aria Components. Oxlint/Oxfmt handle linting/formatting. `components.json` selects shadcn’s `aria-vega` style. Use `pnpm run ui add <component>` for new Aria primitives. Actions use `Button` with `onPress`/`isDisabled`; navigation uses `LinkButton` with `href`.

See the [verification record](docs/verification.md) for completed checks and remaining installed-extension/browser coverage.

## Working with an agent

Read [AGENTS.md](AGENTS.md) for conventions and verification expectations. Project-local skills in [`.agents/skills/`](.agents/skills/) cover extension development, Godot scene diffs, and popup presentation.
