# Working on SceneSleuth

## Purpose and product boundaries

SceneSleuth helps Godot developers understand `.tscn` scene changes in GitHub pull requests. The intended experience is a structured scene review inside the browser. Read [README.md](README.md) for the current state and known limitations before promising behavior.

This is a TypeScript browser extension with a React popup, Vite builds, and Tailwind CSS. There is no backend or configured automated test runner. Keep changes focused on this architecture unless the task calls for changing it.

## Repository map

- `public/manifest.json`: source manifest and permissions.
- `content_script/content-script.ts`: active GitHub integration and message handling.
- `content_script/scripts/`: diff extraction, parser experiments, inline rendering, and styles.
- `content_script/second_try/`: alternative parser, currently disconnected.
- `popup/src/`: popup components, styles, and browser messaging consumer.
- `background/background.ts`, `content_script/main.ts`: reserved entry points without runtime behavior.
- `vite.config.ts`, `vite-content.config.ts`, `vite-background.config.ts`: build entry points.
- `scripts/check-build.mjs`: verifies built manifest assets and classic content script syntax; runs at the end of the build.
- `test.html`: large saved GitHub diff fixture; read relevant sections rather than dumping the whole file.
- `dist/`: current generated output, ignored by Git. `build/`: older generated output. Edit source files rather than either output directory.

## Implementation conventions

- Use npm and preserve `package-lock.json`; install reproducibly with `npm ci`.
- Follow the surrounding TypeScript and React style. Prefer explicit domain and message types over new `any` values.
- Distinguish a diff operation (`addition`, `deletion`, or a future modification) from a scene object's kind and Godot class. These are different concepts.
- Keep HTML extraction, scene parsing, comparison, and rendering separable. Pure parsing code should not require extension APIs.
- Preserve file paths and old/new source line references where available so structured changes can lead back to the original review.
- Treat scene text and GitHub HTML as untrusted input. Use React text rendering or DOM text APIs; escape values when generating HTML strings.
- Make DOM processing repeatable without duplicate results or observer loops. Account for GitHub navigation and delayed rendering.
- Keep popup data scoped to the active tab. The popup can close and reopen while the content script continues running.
- Use the existing styling and component approach. Include visible loading, empty, unsupported-page, and error states when changing popup data flows.
- Keep permissions tied to actual functionality. Validate Chrome and Firefox behavior separately instead of assuming that `chrome`/`browser` branches establish compatibility.

## Working with scene diffs

Changed lines are not a complete scene. Do not infer that an unchanged property was deleted or invent a resource's contents when the diff omits them. Preserve uncertainty in partial parses and show a raw-text fallback for unsupported constructs.

The active parser currently discards its structured results, and inline diff replacement is disabled. Recheck the actual call path before extending one of the experimental parsers. Avoid adding a third competing parser without a concrete reason.

## Verification

Run checks appropriate to the change:

```sh
npm run lint
npm run fmt:check
npm run typecheck
npm run build
```

TypeScript 7 checks the popup, content scripts, background, and all Vite configurations. The build runs this check before bundling with Vite 8 and verifying the built manifest assets. Use `build.rolldownOptions` for bundler configuration. Manifest content scripts must remain classic JavaScript without module imports or exports. Use Oxlint's built-in TypeScript, React, and accessibility plugins rather than adding ESLint dependencies or suppression comments. Oxfmt defines formatting; `test.html` remains an unchanged captured fixture.

For extension behavior, verify the built extension in a supported browser: a PR with scene changes, a PR without scene changes, delayed diff loading, navigation between PRs, and popup close/reopen. Confirm that data does not duplicate or leak across tabs. Check relevant page, popup, and background consoles. State which browser and paths you actually exercised.

For parser fixes, add focused fixtures and regression coverage when the task needs it. Include partial hunks and a meaningful before/after assertion. No test runner exists yet; introduce one deliberately rather than citing a nonexistent `npm test` command. Documentation-only changes need link and accuracy checks, not browser testing.

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
