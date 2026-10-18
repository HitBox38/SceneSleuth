# Working on SceneSleuth

## Purpose and product boundaries

SceneSleuth helps Godot and Unity developers understand serialized scene and asset changes in GitHub pull requests. Supported formats are listed in README.md and centralized in `shared/fileTypes.ts`. The intended experience is a structured review inside the browser. Read [README.md](README.md) for the current state and known limitations before promising behavior.

This is a TypeScript 7 browser extension with a React popup, Vite 8 builds, Tailwind CSS, and React Aria components. Oxlint and Oxfmt handle linting and formatting. There is no backend. Focused regression tests use Node’s built-in test runner and TypeScript stripping. Keep changes focused on this architecture unless the task calls for changing it.

## Repository map

- `public/manifest.json`: source manifest and permissions.
- `content_script/content-script.ts`: active GitHub integration and message handling.
- `content_script/scripts/`: GitHub data/DOM adapters, unified patch parsing, scene parsing, and comparisons.
- `shared/`, `ui/`: domain/message types, shared scene presentation, and per-file shadow-root reviews.
- `tests/`: synthetic parser, patch, and GitHub-data regression coverage.
- `popup/src/`: popup components, styles, and browser messaging consumer.
- `vite.config.ts`, `vite-content.config.ts`: popup and classic IIFE content-script build entry points. No background process is needed.
- `scripts/check-build.mjs`: verifies built manifest assets and classic content script syntax; runs at the end of the build.
- `dist/`: current generated output, ignored by Git. `build/`: older generated output. Edit source files rather than either output directory.

## Implementation conventions

- Use the pnpm version pinned in `package.json` and preserve `pnpm-lock.yaml`; install reproducibly with `pnpm install --frozen-lockfile`. Use `pnpm add`/`pnpm remove` for dependency changes and `pnpm dlx` for temporary CLIs.
- Follow the surrounding TypeScript and React style. Prefer explicit domain and message types over new `any` values.
- Distinguish a diff operation (`addition`, `deletion`, or a future modification) from a scene object's kind and Godot class. These are different concepts.
- Keep HTML extraction, scene parsing, comparison, and rendering separable. Pure parsing code should not require extension APIs.
- Preserve file paths and old/new source line references where available so structured changes can lead back to the original review.
- Treat scene text and GitHub HTML as untrusted input. Use React text rendering or DOM text APIs; escape values when generating HTML strings.
- Make DOM processing repeatable without duplicate results or observer loops. Account for GitHub navigation and delayed rendering.
- Mount inline reviews in the supported file’s diff body. Keep the original table in place for extraction and GitHub line comments, preserve its display style when restoring it, and preserve native file-header controls and unsupported diffs. Put the view switch immediately before Viewed in the file header; remove it with its body mount and reconcile it when GitHub replaces the header. Reconcile mounts even when parsed data has not changed. Use file-appropriate labels from `shared/fileTypes.ts`. Scenes include exported `.escn`; configuration sidecars use the compact settings layout.
- A table element can be reused for a different file. Recheck its current file label before retaining a mount, remove stale UI for unsupported files, and observe identity attributes as well as row/text changes. Test scene/configuration switches with distinct values.
- Check the owning `react-app` element’s `initial-path` before consuming embedded GitHub data. SPA navigation can retain another route’s payload. A rendered-table fallback must label its file listing as incomplete and retain partial scene coverage.
- Keep the GitHub startup match broad enough to detect navigation from non-PR pages into a PR. Gate scene extraction and inspector creation behind `reviewContext`; do not read scene payloads or render a panel on other pages.
- Enable React Aria's shadow-DOM support through `@react-stately/flags` before mounting the in-page inspector. Verify press, focus, and keyboard interactions in the actual shadow root, not only a standalone React page.
- Keep popup data scoped to the active tab. The popup can close and reopen while the content script continues running.
- Use the existing styling and component approach. Include visible loading, empty, unsupported-page, and error states when changing popup data flows.
- `components.json` uses shadcn's `aria-vega` style. Use `pnpm run ui info` or `pnpm run ui add <component>` with the pinned CLI. Keep new components on the React Aria base.
- Use `Button` with `onPress`/`isDisabled` for actions and `LinkButton` with `href` for navigation. Preserve React Aria render props, forwarded refs, and state attributes when extending these wrappers; Radix's `asChild` composition is no longer part of the API.
- Keep permissions tied to actual functionality. Validate Chrome and Firefox behavior separately instead of assuming that `chrome`/`browser` branches establish compatibility.

## Working with scene diffs

Changed lines are not a complete scene. Do not infer that an unchanged property was deleted or invent a resource's contents when the diff omits them. Preserve uncertainty in partial parses and show a raw-text fallback for unsupported constructs.

The same parser/comparison pipeline supports `.godot`, `.import`, `export_presets.cfg`, `.gdextension`, and `plugin.cfg` configurations through `parseScene`'s settings mode. Exclude the generated `.godot/` directory. GDExtension library matching is ordered: compare the key order established by available source lines. Relative GDExtension library/icon paths and plugin script paths resolve beside their configuration; never infer relative file links from unrelated metadata. Keep settings sections distinct from scene objects. Global settings require file-start context; never infer a missing section from a setting name or a previous hunk. Preserve multiline input definitions, direct file references, autoload singleton markers, and unresolved UIDs without evaluation. Text `.tres` resources use resource mode in the same parser: distinguish `[gd_resource]` metadata, `[sub_resource]` embedded resources, and the main `[resource]` section. Do not count file metadata as a resource or treat resource properties as nodes. Missing headers retain unresolved resource context; main resource types are shown only when declared in the available hunk. Binary `.res` resource files remain unsupported. Use `shared/fileTypes.ts` for discovery and file-appropriate presentation labels.

Unity uses `unityParser.ts` as a format adapter into the shared comparison model. Keep GameObjects, components, and other Unity objects distinct from Godot nodes/resources. File IDs are strings, including signed 64-bit values. Never infer an object or nested property owner from a previous hunk. Keep prefab modifications and stripped objects explicit; do not instantiate unseen prefabs. Only resolve local pointers from available same-file objects, and external GUIDs from unambiguous `.meta` evidence for that side of the comparison. `.meta` files use the headerless metadata adapter; importer properties require a same-hunk root mapping. YAML syntax inspection uses the pinned `yaml` package with a failsafe schema and bounds; never execute tags, convert scene documents to JS objects, or resolve aliases. Preserve exact source slices and incomplete-value flags. Keep parse caches scoped to the current PR route/comparison and invalidate individual entries when patch text changes.

The active path is GitHub data/DOM adapters → unified hunks → scene sections → comparisons → inspector/popup. Preserve hunk boundaries and cached results only within the same PR and comparison. GitHub-lazy files must remain explicitly pending until their text loads. Do not replace GitHub’s diff controls or add a competing parser.

## Verification

Run checks appropriate to the change:

```sh
pnpm run lint
pnpm run fmt:check
pnpm run typecheck
pnpm test
pnpm run build
```

TypeScript 7 checks the popup, content scripts, shared UI, tests, and all Vite configurations. The build runs this check before bundling with Vite 8 and verifying the built manifest assets. Use `build.rolldownOptions` for bundler configuration. Manifest content scripts must remain classic JavaScript without module imports or exports. Use Oxlint's built-in TypeScript, React, and accessibility plugins rather than adding ESLint dependencies or suppression comments. Oxfmt defines formatting. Any local legacy `test.html` capture is ignored and must remain untracked; use synthetic fixtures in `tests/` for shared coverage.

For extension behavior, verify the built extension in a supported browser: a PR with scene changes, a PR without scene changes, delayed diff loading, navigation between PRs, and popup close/reopen. Confirm that data does not duplicate or leak across tabs. Check relevant page and popup consoles. State which browser and paths you actually exercised.

For parser fixes, add focused fixtures and regression coverage when the task needs it. Include partial hunks and a meaningful before/after assertion. Use `pnpm test` for the built-in Node runner. Keep tests independent of extension APIs; never commit private game source as fixtures. Documentation-only changes need link and accuracy checks, not browser testing.

Do not silently fix unrelated baseline failures. Report the commands run, their results, and any remaining verification gaps. If loading or type-checking is blocked, say so rather than calling the build a working release.

## Agent skills

Skills are kept in `.agents/skills/` so they can be shared with the project. Read the matching `SKILL.md` when the task falls within its description. They can also be invoked explicitly:

- [scenesleuth-extension](.agents/skills/scenesleuth-extension/SKILL.md): extension entry points, browser messaging, GitHub DOM integration, packaging, and runtime verification. Example: “Use $scenesleuth-extension to handle navigation between GitHub PRs.”
- [godot-scene-diffs](.agents/skills/godot-scene-diffs/SKILL.md): `.tscn` parsing, scene identity, partial input, and semantic comparisons. Example: “Use $godot-scene-diffs to compare node properties between scene versions.”
- [scenesleuth-popup](.agents/skills/scenesleuth-popup/SKILL.md): React popup state, accessibility, and presenting scene changes. Example: “Use $scenesleuth-popup to show useful empty and error states.”

These are project-authored skills and require no global installation. They do not install browser tooling, a Godot runtime, or a test runner. If the agent does not automatically discover them, open the linked file directly.

## Documentation and task tracking

Keep the README's current behavior separate from intended features. Update it when setup, supported browsers, or user-visible capabilities change.

No issue tracker is configured in this checkout. Do not invent a remote, create an issue workflow, or initialize Git as a side effect of development. If a task needs an external tracker, use the destination supplied for that task.
