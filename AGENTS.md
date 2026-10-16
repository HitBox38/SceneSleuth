# Working on SceneSleuth

## Purpose and product boundaries

SceneSleuth helps Godot developers understand `.tscn` scene changes in GitHub pull requests. The intended experience is a structured scene review inside the browser. Read [README.md](README.md) for the current state and known limitations before promising behavior.

This is a TypeScript 7 browser extension with a React popup, Vite 8 builds, Tailwind CSS, and React Aria components. Oxlint and Oxfmt handle linting and formatting. There is no backend. Focused regression tests use Node’s built-in test runner and TypeScript stripping. Keep changes focused on this architecture unless the task calls for changing it.

## Repository map

- `public/manifest.json`: source manifest and permissions.
- `content_script/content-script.ts`: active GitHub integration and message handling.
- `content_script/scripts/`: GitHub data/DOM adapters, unified patch parsing, scene parsing, and comparisons.
- `shared/`, `ui/`: domain/message types and shared shadow-root inspector.
- `tests/`: synthetic parser, patch, and GitHub-data regression coverage.
- `popup/src/`: popup components, styles, and browser messaging consumer.
- `vite.config.ts`, `vite-content.config.ts`: popup and classic IIFE content-script build entry points. No background process is needed.
- `scripts/check-build.mjs`: verifies built manifest assets and classic content script syntax; runs at the end of the build.
- `test.html`: large saved GitHub diff fixture; read relevant sections rather than dumping the whole file.
- `dist/`: current generated output, ignored by Git. `build/`: older generated output. Edit source files rather than either output directory.

## Implementation conventions

- Use the pnpm version pinned in `package.json` and preserve `pnpm-lock.yaml`; install reproducibly with `pnpm install --frozen-lockfile`. Use `pnpm add`/`pnpm remove` for dependency changes and `pnpm dlx` for temporary CLIs.
- Follow the surrounding TypeScript and React style. Prefer explicit domain and message types over new `any` values.
- Distinguish a diff operation (`addition`, `deletion`, or a future modification) from a scene object's kind and Godot class. These are different concepts.
- Keep HTML extraction, scene parsing, comparison, and rendering separable. Pure parsing code should not require extension APIs.
- Preserve file paths and old/new source line references where available so structured changes can lead back to the original review.
- Treat scene text and GitHub HTML as untrusted input. Use React text rendering or DOM text APIs; escape values when generating HTML strings.
- Make DOM processing repeatable without duplicate results or observer loops. Account for GitHub navigation and delayed rendering.
- Keep popup data scoped to the active tab. The popup can close and reopen while the content script continues running.
- Use the existing styling and component approach. Include visible loading, empty, unsupported-page, and error states when changing popup data flows.
- `components.json` uses shadcn's `aria-vega` style. Use `pnpm run ui info` or `pnpm run ui add <component>` with the pinned CLI. Keep new components on the React Aria base.
- Use `Button` with `onPress`/`isDisabled` for actions and `LinkButton` with `href` for navigation. Preserve React Aria render props, forwarded refs, and state attributes when extending these wrappers; Radix's `asChild` composition is no longer part of the API.
- Keep permissions tied to actual functionality. Validate Chrome and Firefox behavior separately instead of assuming that `chrome`/`browser` branches establish compatibility.

## Working with scene diffs

Changed lines are not a complete scene. Do not infer that an unchanged property was deleted or invent a resource's contents when the diff omits them. Preserve uncertainty in partial parses and show a raw-text fallback for unsupported constructs.

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

TypeScript 7 checks the popup, content scripts, shared UI, tests, and all Vite configurations. The build runs this check before bundling with Vite 8 and verifying the built manifest assets. Use `build.rolldownOptions` for bundler configuration. Manifest content scripts must remain classic JavaScript without module imports or exports. Use Oxlint's built-in TypeScript, React, and accessibility plugins rather than adding ESLint dependencies or suppression comments. Oxfmt defines formatting; `test.html` remains an unchanged captured fixture.

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
