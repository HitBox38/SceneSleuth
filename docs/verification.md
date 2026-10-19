# Verification record

Development build 0.1.0, checked on 2026-10-16.

## Automated checks

- `pnpm install --frozen-lockfile`: passed with pnpm 10.28.1.
- `pnpm run lint`, `pnpm run fmt:check`, `pnpm run typecheck`: passed.
- `pnpm test`: 27 tests passed using Node’s built-in runner.
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

The installed-extension checks below cover the earlier floating-panel build. The subsequent inline replacement has separate coverage recorded at the end of this file.

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

## Inline file-diff replacement

The floating inspector was replaced with a structured review inside each loaded scene file’s diff body. The live private PR’s DOM was inspected in the shared browser: the annotated body wraps a `table[aria-label="Diff for: …"]`, separately from the file header. The implementation inserts a shadow-root view before that table and switches the table’s display without removing GitHub-owned content.

On the synthetic `/tests/browser.html` fixture in the shared Chromium browser:

- Scene view hides the original table and displays the expected property before/after values.
- Pointer activation of Original diff restores the table; Shift+Tab and Enter return to Scene view.
- Filters and search operate inside the shadow root; HTML-like values remain text.
- A source-line link reveals the original table before navigating to its fragment.
- Twenty repeated processing calls and a replacement split-view table retain one inline mount and the chosen view, including after a source-line fragment was visited.
- A delayed second scene receives its own mount. Changing its view does not change the first scene’s view.
- Leaving the review removes all inline mounts and restores both source tables. The non-scene table stays visible throughout.
- The preserved file-header Viewed checkbox remains interactive.
- At 507 px and 360 px viewport widths, the document has no horizontal overflow.
- A fresh fixture load has no captured console errors or warnings.

These checks exercise the production mounting/UI code with synthetic data, separately from the installed-extension checks below.

After the user reloaded the inline build, installed Chrome checks on the real private PR confirmed:

- Four inline mounts appear inside the annotated diff bodies, with section counts 9, 11, 6, and 17. There is no floating inspector. Non-scene tables retain their original display.
- The highlighted scene’s Original diff toggle restores GitHub’s table, and keyboard Enter returns to Scene view with 11 sections.
- GitHub’s Collapse file removes that mount; Expand file restores exactly one mount with 11 sections.
- Selecting the first commit shows only the two corresponding scenes, with 9 and 12 sections. These match a fresh parse of the local Git commit exactly: 12 node changes and seven resource changes across both files. The earlier floating-panel snapshot recorded only the initially loaded scene counts before the delayed main scene loaded.
- Returning to All commits restores four mounts and 43 sections. Selected-commit source links retain that comparison’s URL. The checked page console has no warnings or errors.
- On a fresh PR load, the real toolbar popup shows four scenes, 21 node changes, and 18 resource changes. Go to scene changes closes the popup, scrolls to the first inline review, and focuses its host without opening a floating panel.

Navigation through the repository PR list exposed a further issue: GitHub retained the list page’s embedded script while rendering the PR’s diff tables. The loader now checks `react-app[initial-path]`, rejects another route’s data, and falls back to rendered tables with an explicitly incomplete file listing. Two Node regressions cover route matching; the browser fixture additionally checks that a valid stale PR payload cannot leak into the current table-derived review, and that an empty rendered listing stays incomplete.

This follow-up fix passed lint, formatting, 25 Node tests, type checking, build checks, and the browser fixture. The later installed navigation retest is recorded below. Firefox and precise GitHub line highlighting remain unverified.

## Inline file identity and value isolation

A browser regression reproduced a stale mount when the same table element changed from a scene to a non-scene file: the old scene’s values stayed attached because its table was still connected and the scene remained in the review cache. Mount reconciliation now validates the current table label and adjacency, and the GitHub observer watches file identity attributes and source text changes as well as child changes.

The fixture’s second scene now has distinct Lantern/energy values instead of cloning the first scene’s Player/Vision values. In Chrome, changing only the table label and header text to a script removed the old scene view and restored the source table. Reusing that table for the second scene produced exactly one mount with `energy: 0.5 → 0.75`, without Player, Vision, or Vector2 values. Twenty repeated processing calls retained one mount and did not trigger further observer updates. A Node regression separately checks that two scene paths with the same basename and node identity retain their distinct before/after values even when GitHub returns file contents in reverse order.

These file-reuse checks use the production observer and mounting code with synthetic input. The shared preview timed out during this fixture check; Chrome was used to complete it.

The previously reloaded navigation build was also checked from a fresh PR-list tab. It reached the rendered-table fallback, exposing another adapter gap: GitHub uses `l:null` or `r:null` source-line identities for added/deleted files. Those rows were being skipped. The adapter now accepts these identities, and the browser fixture checks the added and removed scene’s exact energy value and operation. Current checks pass: lint, formatting, 26 Node tests, type checking, build asset/syntax checks, and the clean Chrome fixture. The fixture console has no errors or warnings.

After the user reloaded commit `499268a`, real installed Chrome checks passed:

- Switching from the enemy scene to Raven shows each file’s own sections: nine for the enemy (including BaseEnemy and VisionCone), eleven for Raven (including Raven and NavigationAgent2D). The Raven view contains neither the BaseEnemy node nor the enemy’s vision-cone script section.
- Raven’s position value is `Vector2(245, 164)` in its own inline property row.
- Switching to `Scripts/base_enemy.gd` leaves its original table visible with no inline scene mount in that file’s region. Returning to Raven retains its own values.
- A fresh tab navigates from the PR list through the PR conversation into Files changed while `react-app[initial-path]` still names the list route. The rendered-table fallback now parses all three added scenes correctly, including their nullable source-line identities.
- Selecting the delayed main scene completes all four inline reviews with section counts 9, 11, 6, and 17 (43 total). No duplicate mounts appear, and the checked page console has no errors or warnings.

The same-element reuse case is covered by the synthetic regression; the real PR checks establish file switching and navigation with the installed extension. Firefox runtime behavior and precise GitHub source-line highlighting remain outstanding.

## Scene-local inline presentation

The inline view now excludes external-resource declaration cards (referenced scripts, textures, and other scene files). Its counts and filters cover only settings, nodes, embedded resources, and signals in that scene. Node property values such as `ExtResource("1")` remain intact; Original diff retains the full source, including external declarations. A file with only external-reference changes displays a local empty state with access to the original diff.

A synthetic scene fixture checks that the script/image cards disappear while the local node’s position and script-reference values, embedded material property, and signal connection remain. The browser view contains four local sections with one node, one embedded resource, and one signal; its Embedded resources filter displays only the local material. The Node regression verifies that presentation filtering does not mutate the original review or its raw source.

A read-only parse of the real Raven patch confirms that its inline presentation now contains exactly Scene settings, Raven, Sprite2D, and NavigationAgent2D, with zero external-file cards. Lint, formatting, 27 Node tests, type checking, and the production build pass. This presentation change requires an installed-extension reload before live Chrome verification; earlier installed results above describe the preceding presentation.

## Compact inline header

Removed the inline SceneSleuth brand row and semantic counts row. The Scene / Original diff switch now mounts in a separate shadow root in GitHub’s file header, immediately before Viewed (between Copilot and Viewed in the observed layout). Native controls remain in place. The adapter uses the observed `data-diff-header-wrapper` and Viewed control; if that insertion point is unavailable, it leaves the original diff visible.

The shared-browser fixture uses the same header/body mounting code with a synthetic GitHub header. It verifies the control order, absence of both removed rows, pointer and keyboard switching, and zero added body height in Original diff mode. Replacing the header restores exactly one switch and one body mount. Two scene files retain independent switch states. Leaving the review removes both switches and bodies and restores the original tables. At 360 px viewport width, document width remains 360 px. Live installed-header verification requires the updated extension to be reloaded.

The subsequent compact-toolbar change removes the visible context-explanation paragraph from inline reviews and puts search on the filter row. The accessible article name retains partial-diff context, and the README documents missing-value semantics. The shared-browser fixture confirms a single 48.5 px toolbar at normal width and at the annotated 507 px width, functioning search, no inline context paragraph, and no horizontal overflow at 360 px. The installed extension requires its next reload to apply these presentation changes.

## Denser inline sections and property rows

Checked on 2026-10-17. Inline section headers use less padding and omit redundant root/duplicate path labels. Meaningful nested paths remain beside the section name. Property status and line metadata share the name row where space permits; row padding and section gaps are smaller. Value text remains fully available, with slightly larger 11 px text. These styles are scoped to the inline view.

At the same 610 px fixture width, the review height decreased from 615.5 px to 407.6 px (about 34%), retaining all six property rows and their before/after values. Section headers decreased from 56 px to 32 px. Chrome fixture checks passed for keyboard disclosure, filtering, search, untrusted value text, and all six rows at a 360 px viewport without horizontal page overflow. The checked Chrome console had no errors or warnings. The shared preview connection failed during screenshot capture, so Chrome was used for the remaining checks. This is fixture coverage; the installed extension needs a reload to apply the denser presentation.

## Referenced-image tooltips

Checked on 2026-10-17. Browser-supported image references now open React Aria tooltips on hover or keyboard focus, while keeping their existing file navigation. Images load only while the tooltip is open, through GitHub's raw-file URL at the appropriate before/after revision. The tooltip includes a transparency checkerboard, dimensions, path, original reference, loading state, and a bounded failure fallback. SVG files render through an image element rather than inserted markup. No permissions changed.

The shared-browser fixture checks the actual shadow-root review with synthetic images served by a worker scoped to the test page. Before and after show distinct 128 × 128 and 160 × 128 graphics at their respective commit URLs. Hover, keyboard focus, hovering the tooltip itself, Escape dismissal, failed loads, Original diff cleanup, and existing PR-file navigation passed. At a 360 px viewport, the 280 px tooltip stayed within the viewport. Pointer tests caught a shadow-root enter/leave issue; bubbling pointer events now drive React Aria's tooltip state there. The deliberate missing-image case produces an expected network 404 and a readable fallback.

Chrome separately loaded the real private Raven PNG through the signed-in GitHub raw-file URL and decoded it at 1000 × 1000. This verifies source access, not the new installed tooltip: that integration still needs a manual extension and PR reload. Firefox remains untested. All 45 Node tests, lint, formatting, type checking, production bundling, and manifest/classic-script checks pass; the existing Lucide directive warnings remain non-failing.

## GitHub and Godot visual integration

Checked on 2026-10-17. Shared theme tokens inherit GitHub's current and legacy semantic colors through the review's shadow roots. The standalone popup has GitHub-dark defaults. The tooltip uses the same token sheet outside the shadow root, so it follows the page theme too.

| Before                                            | After                                                                   | Purpose                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------- |
| Fixed forest colors                               | GitHub surfaces, borders, text, and diff tints                          | Blend into the active page theme         |
| Right-hand disclosure and generic section styling | Left-hand disclosure, colored scene-type icons, restrained class labels | Recall Godot's scene tree and inspector  |
| Tinted empty before/after cells                   | Neutral empty cells, red/green actual values                            | Keep change emphasis on available values |
| Separate green image tooltip                      | Shared overlay colors and neutral checkerboard                          | Match the review and GitHub hover cards  |

The shared-browser fixture verified dark and light palettes, live theme changes while an image tooltip is open, filter/search behavior, keyboard Scene/Original diff switching, and repeated mounting without duplicates. At 360 px, page width remained 360 px and the 280 px tooltip stayed within the viewport. Sample text contrasts passed 4.5:1, including the light-theme blue reference link against the added-value background (4.66:1). A fresh standalone popup load shows the matching dark palette at 360 px with no console errors.

All 45 Node tests, lint, formatting, type checking, bundling, and classic-script/manifest checks pass. The production content bundle contains the resolved theme styles with no unresolved CSS import. These are shared-browser and build checks; the installed extension needs a reload for real GitHub verification, and Firefox runtime styling remains untested.

## Public Godot PR verification

Checked on 2026-10-17 in Chrome with the installed extension, after the user reloaded the current build (`d079561`). The public [Godot demo PR #1356](https://github.com/godotengine/godot-demo-projects/pull/1356/changes) changes `2d/sprite_shaders/sprite_shaders.tscn` and nine shader files.

- The scene renders exactly one inline review and one header switch, with 12 changed nodes and 13 property changes matching a separate parse of the public unified patch. Root scale is `Vector2(0.3, 0.3)` before and `Vector2(0.4, 0.4)` after; the removed root position and Camera2D offset change also match. Coverage remains explicitly partial.
- All 12 node headers show the current type icons. The inline background and native GitHub body both resolve to `rgb(33, 40, 48)` in the active dark theme. No values from previously tested scenes appear.
- Pointer activation of Original diff restores the source table; keyboard Enter on Scene restores the review. Search for `scale` retains only the owning SpriteShaders section, and clearing search restores the 12 sections without duplicate mounts.
- All nine shader tables retain their native `table` display. The checked page console has no warnings or errors.

This PR has no changed resource-reference values, so reference navigation and image tooltips are not exercised here. Popup close/reopen, light-theme behavior on real GitHub, and Firefox are not part of this run. No runtime source changed; the previously passing build checks above were not repeated for this verification-only update.

## Inspector-style property presentation

Checked on 2026-10-17 in the shared browser's synthetic GitHub fixture, using the production shadow-root renderer. Inline reviews now show collapsible groups for common node properties, numeric vector components, RGBA swatches, readable property labels, and distinct icons for familiar node classes. Before/After headings appear once per file, section metadata moves into the node header, and compact property markers retain operation text for assistive technology. Grouping is a presentation convention, not a complete reflection of Godot's property schema. Unknown fields remain available in Properties.

The inspector fixture retains all eight changed property rows across Player, Camera3D, and Sprite, with four color swatches and exact signed/exponent vector labels. Serialized values remain available in hover text and screen-reader text. Executable-looking text stays literal, with no inserted image elements. Four Node regressions cover literal recognition, malformed/unsupported values, color alpha, and grouping without lost changes.

Browser checks passed for dark/light palettes, keyboard group disclosure, readable-label search (`collision layer`), source-line links revealing the original table, pointer/keyboard view switching, and repeated processing without duplicate mounts. At 360 px, the page width remains 360 px and property cells have no horizontal overflow. An existing image-reference tooltip still loads its synthetic 128 × 128 image on keyboard focus. A fresh fixture snapshot has no console entries. These are fixture checks; the installed extension needs another reload before verifying this presentation on a real PR. Firefox remains untested.

All 49 Node tests, lint, formatting, type checking, production bundling, and manifest/classic-script checks pass. The two existing Lucide directive warnings remain non-failing.

After the user reloaded `bdd6d96`, installed Chrome verification on public Godot demo PR #1356 passed: 12 node sections retain all 13 property changes, with 25 vector values rendered as labeled components, 11 Transform groups, and one shared column heading. Keyboard Enter closes/reopens a Transform group; searching `Outline` shows only that node. The `After line 64` link reveals the native scene table at its `R64` anchor, and keyboard activation of Scene restores exactly one review. All nine shader tables remain native, and the checked page console has no warnings or errors. This PR has no changed color or resource-reference values, so those retain fixture coverage from above.

## Nested Godot project file links

On 2026-10-17, installed Chrome on [Godot demo PR #1320](https://github.com/godotengine/godot-demo-projects/pull/1320/changes) reproduced a `Bomb.cs` click opening a 404 at the repository root. The file exists under `networking/multiplayer_bomber_cs/`. The page supplies the correct head revision and file targets; the bug was treating every `res://` path as repository-relative.

File links and image sources now resolve inside the nearest ancestor project with a `project.godot` marker in the comparison's file listing. Before/after paths honor renamed, added, and removed markers independently. Sibling projects cannot supply each other's roots, and `res://..` cannot escape the selected project. Missing markers retain the documented repository-root fallback; no extra repository requests or permissions were added.

Two regressions first reproduced the incorrect links and now pass, covering nested script/image PR targets, files outside the PR, renamed project roots, nearest-root selection, relative paths, and project-boundary escapes. A separate parse of the real public patch checks all 90 file-reference occurrences across seven scenes: every one now resolves to a PR diff, and all seven image occurrences retain the nested directory in their raw URLs.

The shared browser's synthetic nested-project fixture verifies that a script click invokes the native file-tree handler and loads its lazy diff. Keyboard focus opens an image preview at the nested raw path and decodes the test-only 160 × 128 image; its link uses the matching nested blob path. The checked fixture console has no entries. The installed fix still needs a manual extension/PR reload before live retesting; Firefox remains untested.

All 51 Node tests, lint, formatting, type checking, production bundling, and manifest/classic-script checks pass. The two existing Lucide directive warnings remain non-failing.

After the user reloaded `5186954`, installed Chrome on PR #1320 confirmed the fix. Clicking the Bomb scene's `Bomb.cs` value jumps to its native C# diff, replacing the previous repository-root 404. The `brickfloor.png` value jumps to the correct image diff, and keyboard focus displays the real 192 × 48 texture preview. The GDScript scene's `player_spawner.gd` value separately jumps to its own project's script diff, confirming isolation between the two nested project roots. The checked page console has no warnings or errors. Color/value presentation is unchanged by this fix; Firefox and undiscovered project roots remain outside this run.

## Project configuration reviews

Checked on 2026-10-18. Text `.godot` files, including `project.godot`, now use the existing GitHub → unified hunk → section/value comparison → inline/popup pipeline. The project mode follows the sectioned text format described in [Godot's project settings documentation](https://docs.godotengine.org/en/stable/tutorials/editor/project_settings.html). Settings sections are distinct from nodes/resources, and the preamble is recognized only when a hunk starts at the beginning of the file. Missing owners stay unresolved. No defaults or serialized objects are executed.

Seven Node regressions cover complete added and deleted files, renamed files, global settings, identical keys in separate sections, exact source lines, quoted keys, multiline descriptions/input objects/nested arrays, truncated values, isolated hunks, direct file paths, singleton markers, unresolved UIDs, and lazy/mixed GitHub discovery. `.tres` and scripts remain unsupported. A separate parse of public PR #1320 finds its two project configurations: the new C# configuration has ten sections and five input actions with no diagnostics; the modified GDScript configuration shows its Dotnet addition and honestly reports truncated unchanged input context.

The shared-browser fixture at `http://127.0.0.1:5174/tests/browser.html` exercises production mounting in shadow roots with synthetic settings. It confirms four changed sections/five settings, the Settings/Original diff switch, keyboard disclosure and switching, rendering search, source-line navigation, and native lazy-file navigation from an autoload link. An icon setting opens the nested project's synthetic 160 × 128 image preview. Dark/light presentation passes; at 360 px the document stays 360 px with no horizontal overflow in property cells. Reusing a scene table for settings removes prior scene values; returning to a scene restores its Scene switch, and reusing a settings table for a script removes its review and restores the source table. Repeated processing and header replacement retain exactly one mount and switch. Checked fixture snapshots have no console entries.

All 58 Node tests, lint, formatting, type checking, production bundling, and manifest/classic-script checks pass. The two existing Lucide directive warnings remain non-failing. These are parser, build, and shared-browser checks; the installed extension and popup close/reopen need a reload before real GitHub verification of the new format. Firefox remains untested.

After the user reloaded `25c6af9`, a further PR-page refresh activated the current content script in installed Chrome on PR #1320. Both project files passed live verification: the modified GDScript project shows only its Dotnet section and one changed setting, with the expected incomplete-context diagnostics; the added C# project shows ten sections and 23 settings, including its exact multiline description, five input dictionaries, and raw autoload UID. Each review stays scoped to its own file. Pointer activation of Original diff restores the native table, and keyboard Enter on Settings hides it again without duplicate mounts. Searching `rendering_method` leaves only Rendering; clearing restores the settings.

The C# project's `lobby.tscn` setting jumps to that scene's inline PR review. Keyboard focus on `icon.webp` loads the real 128 × 128 image from the nested project directory at the PR's head revision. The toolbar popup reports nine Godot files and 24 settings. Its Go to Godot changes action closes the popup and focuses the inline review. After loading the pending C# world scene through GitHub's Load Diff button, reopening the actual toolbar popup requests current data: the pending label disappears and its totals update from 42 nodes / 33 resources / six signals to 136 nodes / 39 resources / seven signals, while retaining 24 settings. All nine loaded files have one mount each. The checked page console has no warnings or errors. Popup-console inspection and Firefox remain unverified. No runtime source changed in this verification run, so the previously passing test/build suite was not repeated.

## Structured collection values

Checked on 2026-10-18 in the shared browser fixture at `http://127.0.0.1:5174/tests/browser.html`. Complete dictionaries, arrays, and `Object(Class, field: value)` expressions now have collapsed summaries with counts and nested key/item disclosures on each side. Exact serialized text remains independently available. This is bounded presentation of existing values, not a change to scene ownership, comparison, or configuration evaluation. Typed/packed arrays and unfamiliar constructors stay opaque; malformed, truncated, commented, or over-budget collections retain their raw presentation.

The settings fixture covers a deadzone change from 0.2 to 0.3, nested InputEventKey fields, replication dictionaries, StringName array items, and executable-looking text rendered literally without inserted image elements. Pointer and keyboard expansion pass in the actual shadow root. Exact before-side source text remains available through Serialized value. Dark/light views pass, and the expanded tree fits a 360 px document without property-cell horizontal overflow. In the scene image fixture, an array's nested reference retains its revision-specific link and loads the synthetic 160 × 128 image on keyboard focus. Five new Node regressions cover meaningful before/after values, duplicate keys and delimiters, reference offsets, raw fallbacks and bounds, and inert expression text. A separate parse of public PR #1320 produces trees for all five input actions and the replication configuration. This new presentation still needs an installed-extension reload before live GitHub verification; Firefox remains untested.

All 63 Node tests, lint, formatting, TypeScript checks, production bundling, and manifest/classic-script validation pass. Checked fixture snapshots have no console entries. The two existing Lucide directive warnings remain non-failing.

## Text resource reviews

Checked on 2026-10-18. Text `.tres` files now use the same discovery, hunk parsing, comparison, reference resolution, and inline presentation path as scenes and configurations. The resource mode follows the `[gd_resource]`, `[sub_resource]`, and main `[resource]` structure in [Godot 4.6's text resource loader](https://github.com/godotengine/godot/blob/4.6/scene/resources/resource_format_text.cpp). File metadata has a distinct section kind and does not increase resource counts. Main resource properties cannot become nodes or embedded resources. Missing section headers remain unresolved, and a main resource's type is only shown when its declaration is available in that hunk. Binary `.res` files remain unsupported.

Five new Node regressions cover complete additions/deletions, before/after property changes, unchanged fields, identities and source lines, embedded references, nested project paths and image revisions, isolated/truncated hunks, renames, pending GitHub text, and format boundaries. The browser fixture also checks DOM extraction and an explicitly incomplete DOM-only listing for resources. A separate parse of public PR #1320's `networking/multiplayer_bomber_cs/tileset.tres` yields complete coverage with no diagnostics: TileSet metadata, a texture declaration, a TileSetAtlasSource, and the main TileSet properties. Its texture and atlas references resolve by name; polygon expressions remain exact source text.

The shared preview repeatedly timed out on snapshots, so browser verification used Chrome on the synthetic fixture at `http://127.0.0.1:5174/tests/browser.html`. The Resource/Original diff switch passes pointer and keyboard activation; source links reveal the preserved table at the exact line. Resource search, embedded-resource disclosure, numeric vector components, and expandable dictionaries pass in the shadow root. Keyboard focus opens the nested project's synthetic 160 × 128 texture preview. The resource-only summary shows three resources without node or signal counts. Header replacement retains one mount and one Resource switch. Reusing the table for configuration removes resource values and changes the switch to Settings; reusing it for a script removes both mounts and restores the source table. Dark/light presentation and checked page console pass. These are fixture checks; the installed extension, toolbar popup, and live PR resource review need a manual reload before verification. Firefox remains untested.

All 68 Node tests, lint, formatting, TypeScript checks, production bundling, and manifest/classic-script validation pass. The two existing Lucide directive warnings remain non-failing.

## Unity scenes, prefabs, and text assets

Checked on 2026-10-18. Unity `.unity`, `.prefab`, and text `.asset` files use a dedicated UnityYAML adapter into the shared hunk/comparison and inline-review pipeline. The adapter follows Unity's [text serialization format](https://docs.unity3d.com/6000.0/Documentation/Manual/FormatDescription.html) and [UnityYAML subset](https://docs.unity3d.com/6000.0/Documentation/Manual/UnityYAML.html). YAML syntax inspection uses pinned `yaml` 2.9.1 with a failsafe schema; it reads bounded syntax nodes and source ranges without object construction, alias resolution, or executable tags. File IDs stay strings, including signed 64-bit IDs.

GameObjects, components, and other Unity objects have separate kinds and counts. Available local references show object names and types; component labels use a known GameObject owner. ScriptableObject-style `.asset` documents retain their declared serialized type rather than being presented as components. Transform vectors, quaternions, and normalized colors get exact labeled components; block/flow collections get expandable trees with serialized source access. Prefab modifications and stripped objects remain explicit, without instantiating an unseen prefab. Fragments lacking their object/property owner remain unresolved, and unsupported or boundary-truncated values retain raw text with uncertainty notes.

GUID pointers resolve through unambiguous GUID lines in loaded `.meta` diffs, independently before/after. The adapters consume embedded metadata and rendered metadata tables while leaving `.meta` reviews native. Known folder metadata and ambiguous mappings invalidate file targets. Renamed metadata preserves old/new asset paths; references either jump to an existing PR file or open its revision-specific repository path. Image previews reuse this same mapping. Missing mappings and Unity/package built-ins remain raw references; no repository-wide GUID search or extra permissions were added.

Eight Node regressions cover complete scene/object identity and ownership, meaningful before/after property values, unchanged fields, source lines, isolated and truncated hunks, prefab overrides and stripped objects, text assets, vectors/colors, literal hostile-looking text, unsupported YAML/limits, local/null/GUID references, metadata ambiguity/renames/folders, lazy discovery, deletion/rename coverage, and parse-cache invalidation across source/PR/comparison changes. The fixture also validates Unity DOM extraction and DOM-only metadata discovery. The cache holds exact unchanged patch results only within the current PR route/comparison and keeps returned diagnostics independent.

Shared-browser verification at `http://127.0.0.1:5174/tests/browser.html` passes in production shadow roots: GameObject/component filters, search by resolved `Player.cs`, native lazy-script navigation, pointer/keyboard Original diff switching, source preservation, prefab/asset header labels, expandable asset YAML, and a keyboard/hover image preview at the correct synthetic 160 × 128 revision. Dark/light views pass; an expanded asset at 360 px has no document or value-cell horizontal overflow. Switching back to Godot removes Unity values, and switching to a script removes both mounts and restores the source table. Checked snapshots have no console entries.

A separate parse of public [AR Foundation sample PR #1217](https://github.com/Unity-Technologies/arfoundation-samples/pull/1217/changes) covers 45 supported files, including added assets/prefabs, deleted prefabs, renamed files, and modified scenes. Eighteen full added/deleted patches have complete coverage; missing owners in partial hunks remain unresolved. A local adapter timing check on that PR's public file patches dropped from approximately 182 ms on the initial pass to 1 ms on an unchanged cached pass, with 39 metadata mappings. These timings are a single local check, not a browser performance benchmark. The PR is open in Chrome; the installed older content script currently mounts no Unity reviews. Installed-extension and actual toolbar-popup verification require the user's manual extension reload and page reload. Firefox, binary Unity assets, `.mat` reviews, full scene rendering, inherited prefab expansion, and unresolved GUIDs remain outside this phase.

All 76 Node tests, lint, formatting, TypeScript checks, production bundling, and manifest/classic-script validation pass. `pnpm install --frozen-lockfile` passes with the updated lockfile. The existing two Lucide directive warnings remain non-failing.

## Additional Unity and Godot formats

Checked on 2026-10-18. Each format was added in its own commit:

- `c50563e`: Unity `.mat` materials.
- `157f814`: Unity `.meta` import settings.
- `1e7e104`: Unity `.controller` animation controllers.
- `2ce9165`: Unity `.overrideController` clip replacements.
- `a3afac5`: Unity `.anim` animation clips.
- `d972ea4`: Godot `.import` source-asset configuration.
- `05eda2c`: Godot `export_presets.cfg`.
- `4f19f91`: Godot `.gdextension` configuration.
- `5535dbc`: Godot `plugin.cfg` editor-plugin configuration.
- `4d30699`: Godot `.escn` exported scenes.

Unity object formats reuse the bounded UnityYAML adapter and comparison model. Metadata has a headerless adapter: root fields and importer mappings stay separate, missing importer context remains unresolved, and duplicate keys/importers retain explicit fallback data instead of silently overwriting values. GUID evidence still comes from the same side-specific metadata extraction. Materials expose saved property trees, named texture references, and nested color swatches. Controllers group parameters, layers, state-machine fields, transition conditions, destinations, and timing. Overrides group original/replacement clip pairs; animation clips group tracks/keyframes, events, and clip settings. This does not provide animation playback, plotted curves, prefab expansion, shader evaluation, or repository-wide GUID discovery.

Godot sidecars reuse the existing settings parser with format-specific class labels and header controls. They count as settings rather than scene objects. Relative GDExtension library/icon paths and plugin script paths resolve beside their configuration; unrelated plugin metadata does not become a relative file reference. Library order is compared using available source-line order because GDExtension matches feature tags from top to bottom. Omitted entries remain unknown. Dependency dictionaries remain expandable source values. `.escn` uses the same scene parser as `.tscn`. Generated `.godot/` files, arbitrary `.cfg` files, binary `.res`/`.scn` files, and export credentials are excluded. Format behavior was checked against [Godot import documentation](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/import_process.html), [GDExtension configuration](https://docs.godotengine.org/en/stable/engine_details/engine_api/gdextension/gdextension_file.html), [plugin configuration](https://docs.godotengine.org/en/stable/tutorials/plugins/editor/making_plugins.html), and [ESCN/TSCN documentation](https://docs.godotengine.org/en/stable/engine_details/file_formats/tscn.html), alongside the existing Unity serialization references above.

Twelve new Node regressions cover all ten formats with meaningful before/after values, retained source lines, incomplete ownership, resource references, configuration boundaries, ordered library matching, metadata ambiguity, and combined GitHub discovery. Every format is checked as pending before lazy text loads, parsed after loading, deleted, and renamed. Existing Unity metadata discovery expectations were updated to include the new independent review while retaining GUID mappings.

The shared Chromium preview at `http://127.0.0.1:5174/tests/formats.html` exercises production DOM extraction and shadow-root mounting for all ten formats. Each selection reuses the same native table and validates extracted changes against the pure parser. All ten show one body mount, one correctly labeled header switch, and the selected file's own sections. Reconciliation and header replacement preserve one switch; reusing the table for an unsupported script removes both mounts and restores the table. Pointer Original diff and keyboard Enter on Animation switch correctly. Animation YAML disclosures work with pointer and keyboard, and search finds the serialized Footstep event. Relative plugin/library links and GUID-resolved material texture links use the expected repository paths and after revision. Expanded material colors render a real color swatch. Dark/light rendering was inspected; material colors, animation values, and ESCN scenes fit a 360 px document without horizontal overflow in the document or value cells. Deep scalar rows stack when narrow, and color components wrap. The original `/tests/browser.html` DOM checks also pass after updating metadata expectations. Checked snapshots have no warning/error console entries; Vite emits development connection/refresh messages.

All 88 Node tests, lint, formatting, TypeScript checks, production bundling, and manifest/classic-script validation pass. Each feature commit was checked before proceeding; the final verification fixes were checked again. No dependencies or permissions changed. These are parser, build, and shared-browser fixture checks. Installed Chrome needs a manual extension reload before live PR verification of this build; actual toolbar-popup close/reopen, cross-tab isolation, delayed live GitHub loading, SPA navigation, and Firefox were not re-verified in this phase. Image-link resolution was checked, but new-format image loading was not exercised against a real repository.

## Viewport loading and stable inline replacement

Checked on 2026-10-18. The reported symptoms were both delayed reviews/page shifts and counts/reference names appearing only after scrolling. In installed Chrome on [AR Foundation sample PR #1217](https://github.com/Unity-Technologies/arfoundation-samples/pull/1217/changes), GitHub listed 152 files while initially supplying five content records, only three with text, and rendering one native table. Scrolling replaced that table with different prefab tables; the embedded payload did not gain their text. The shared preview's signed-out session received the legacy `/files` layout, so the modern native lifecycle was inspected in the existing signed-in Chrome tab.

The prior runtime retained loaded file reviews but rebuilt reference navigation from the initial payload whenever it was present. A newly learned metadata GUID could therefore disappear after its table left view. The focused state regression failed with an unresolved image path before the fix, then passed after retaining same-comparison evidence. Renamed paths and exact revision IDs now survive absent/undefined viewport fields, while explicit null invalidations, changed comparisons, and route/refresh resets clear the appropriate state. Partial DOM fragments cannot downgrade complete loaded file patches.

Available supported patches now load through GitHub's own `page_data/diff_entries` GET endpoint. The request shape was checked against the live page's [native request implementation](https://github.githubassets.com/assets/10y-d015d50d226ae85f.js) and [verified-fetch headers](https://github.githubassets.com/assets/app-runtime-71a2f665eeca033f.js), then verified with real public endpoint responses. Requests retain the selected base/head and whitespace mode, encode filename lists exactly, use the existing GitHub session, allow two concurrent four-file batches, time out after 15 seconds, and cap streamed responses at 8 MB. Responses are restricted to requested paths and checked against comparison commit IDs. Navigation/refresh aborts in-flight work and rejects late results. If SPA markup retains another route's payload, a bounded same-origin page read can recover the current comparison; otherwise DOM-only coverage stays explicit. Popup progress, generated/limited pending labels, and recoverable preload failures remain distinct.

A standalone real-transport check started with all 111 supported paths from PR #1217 pending and exercised the production loader/cache/adapter through curl-backed fetches: 28 batches yielded 54 available reviews; 57 files remained pending because GitHub withheld their text. A direct generated metadata response had `newTreeEntry.isGenerated=true` and no lines. Its native Chrome view showed **Load Diff** and the generated-file explanation. The loader respects these controls instead of forcing them open. This transport check is not installed-extension verification and did not establish new GUID mappings, since the metadata was withheld.

In the shared Chromium fixture at `http://127.0.0.1:5174/tests/virtualized.html`, all three synthetic files become ready with only one native table present. Scrolling removes/recreates tables while counts stay at three and Forest/Desert/Ocean retain their distinct 100/200/300 values. No duplicate body/header mounts appear. A deterministic replacement test using the previous renderer moved the second file by −974.25 px. The corrected renderer committed both shadow roots before measurement and preserved that file within −0.25 px. The temporary old-renderer module was removed after this comparison. The production mutation observer ignores its own mount changes, watches route identity changes, and schedules processing on the next animation frame rather than waiting 150 ms.

The original `/tests/browser.html` DOM checks still pass. Pointer Original diff followed by keyboard Enter on Scene restores the structured view with one body mount and one switch, and repeated processing does not start an observer loop. Checked fixture snapshots contain no warning/error console entries. The scroll-proof screenshot is retained outside the repository in the browser artifacts directory.

All 99 Node tests, lint, formatting, TypeScript checks, production bundling, and classic-script/manifest checks pass. New regressions cover batch encoding/ranges, native hunk adaptation, stale IDs, unrelated paths, streamed limits, concurrency/deduplication, cancellation and late results, failed-request retries, DOM-only bootstrap lifetime, generated-file controls, and cached navigation/file lifetimes. No dependencies, permissions, tokens, backend, or persistent storage were added. The built `dist/` still requires the user's manual extension reload before verifying this exact build's live Chrome scrolling and actual popup close/reopen. Private-repository requests, authenticated SPA bootstrap, cross-tab messaging, and Firefox were not exercised in this phase.

## Unity Inspector context for nested input bindings

Reproduced on [AR Foundation samples PR #1217, HandVisualizer.unity](https://github.com/Unity-Technologies/arfoundation-samples/pull/1217/changes#diff-62f3368013bae7bf9a892a7d94fb8a8e9b3daf6d02b700c626e95af96975649a). The installed Chrome extension showed an unresolved object and raw nested binding YAML: the native hunk starts at line 368, omitting both the MonoBehaviour header and `m_TrackingStateInput` owner.

Fetched the public renamed file at the comparison’s exact base `488dae314cc21346888a461764d1d5d864f37685` and head `954f3dfc8f771f53894e1cc01fe7c6d1ee9f79f6`. GitHub’s partitioned blob payload contains 833 before lines and 849 after lines. Production validation/comparison recovers one changed component on `XR Origin/Camera Offset/Main Camera`, with only `m_TrackingStateInput` changed. The before binding list is empty; after contains `<XRHMD>/trackingState` and `<HandheldARInputDevice>/trackingState`. No public scene source was added to the repository.

The Tracked Pose Driver package GUID was checked against [Unity’s Input System metadata](https://github.com/Unity-Technologies/InputSystem/blob/4e169d9b2343f3104ce58c9fda499e721acfc2e8/Packages/com.unity.inputsystem/InputSystem/Runtime/Plugins/XR/TrackedPoseDriver.cs.meta). Input Action fields follow [Unity’s embedded-action Inspector model](https://docs.unity3d.com/Packages/com.unity.inputsystem@1.14/manual/Actions.html#creating-actions-by-declaring-them-in-monobehaviours). This is a read-only typed presentation; custom Editor code is not executed.

The shared Chromium browser exercised `/tests/unity-inspector.html`, using synthetic blob transport with the actual loader, cache, parser, comparison, and shadow-root renderer. The public review was also supplied in memory to the same fixture for visual inspection. Confirmed the hierarchy, named before/after input fields, both binding summaries, one mount, and no clipped value cells. Pointer Original diff and Shift+Tab/Enter back to Scene preserved the native table and restored one inline view. Regression coverage verifies exact revisions/renamed paths, mismatched/truncated rejection, unchanged-property exclusion, native source-line anchors, duplicates, package type identity, input references/flags, cache retention, cancellation, and recoverable failure.

All 105 tests, lint, formatting, TypeScript, production builds, and classic-content-script verification pass. The new installed Chrome build still needs an extension reload and live PR check. Authenticated private blob loading, popup close/reopen, cross-tab messaging, and Firefox were not reverified in this change.

## Repository-aware Godot/GitHub and Unity/GitHub themes

Added independent engine and GitHub appearance state. Root detection uses the exact head commit, one same-origin tree GET (5 seconds / 2 MB), and explicit project markers. PR file evidence remains available for failed lookups and nested projects; mixed repositories theme inline files individually and keep the popup neutral. Unsupported/unknown repositories do not default to Godot. No permissions or dependencies changed, and the pending SVG icon concepts are untouched.

Validated the root-tree adapter against the actual public AR Foundation samples tree at `954f3dfc8f771f53894e1cc01fe7c6d1ee9f79f6`: its `codeViewTreeRoute` payload has root `Assets` and `ProjectSettings` directory entries and resolves to Unity. The lookup rejects mismatched revisions, non-root routes, incomplete listings, and directory/file marker confusion. Regression tests cover repository precedence over file format, pending/offscreen evidence, mixed projects, empty documentation-only reviews, request deduplication/cancellation, stale navigation, and optional message-field validation.

Shared Chromium browser verification at `/tests/themes.html` used the production root adapter/loader, inline renderer, separate header shadow root, image-preview portal, and actual popup App. Repository responses, tab APIs, and image transport were synthetic. Confirmed Unity's 2 px component corners, neutral icons, triangle foldouts, sans-serif values and inset fields; Godot retains 4 px inline sections, colored 3D node icons, and existing grouped Transform values. Both light and dark GitHub palettes apply to inline content and popup, including popup unmount/reopen. Mixed repository switching retains one mount, applies Unity/Godot per file, and uses a neutral popup. A portaled Unity-themed image preview has 2 px corners and loads the 160 px synthetic image. Pointer Original diff and Shift+Tab/Enter back to Scene retain the engine theme and the native source table.

All 110 tests, lint, formatting, TypeScript, production build, and classic-content-script checks pass. The installed Chrome extension still needs reloading for live PR verification; private tree loading, actual cross-tab switching, and Firefox were not exercised in this change. The browser fixture's popup messaging is a mock and does not establish installed-extension messaging compatibility.

## Scene Eye project and per-tab extension branding

Promoted Scene Eye as the selected icon. `shared/sceneEye.ts` supplies one geometry model to React branding, standalone SVG masters, and browser-generated PNG exports. The PNGs cover 16, 24, 32, 48, 64, and 128 px for Godot, Unity, and neutral contexts. The README, popup favicon, extension manifest, popup header, and standalone Inspector use the selected design. Previous concept drafts are not part of the shipped extension.

Chrome's [action documentation](https://developer.chrome.com/docs/extensions/reference/api/action#icon) requires PNG images for unpacked toolbar icons; the exported PNGs are direct SVG rasterizations, without AI image generation or a new dependency. The shared [cross-browser background declaration](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background#cross-browser_manifest_v3_background_scripts) uses a service worker in Chrome 121+ and scripts in Firefox 121+. No extension permissions changed. Review parsing/messaging remains in the content script and popup; the background receives only a validated engine choice, PR identity, and sender tab, then sets packaged icon paths and an accessible title.

Regression coverage confirms identical geometry across palettes, source/export presence and PNG dimensions, per-tab icon independence, deduplication, newer navigation resets winning over in-flight writes, closed-tab cleanup, recoverable API failures, and rejection of wrong senders, frames, URLs, themes, and stale PR identities. The build verifies classic background syntax and every icon asset alongside the content-script checks. The compiled background IIFE also passed a Node VM smoke check with stubbed `chrome` and `browser` APIs: listener registration, independent tab icons, and loading-navigation resets. This does not establish native browser compatibility.

Shared Chromium browser checks exercised `/tests/icon-assets.html` to generate all PNG sizes and `/tests/themes.html` to render the actual popup. Godot shows the blue eye (`#78b6e8`), Unity the off-white eye (`#e6edf3`), and mixed contexts the neutral eye (`#bdc6d0`). Switching engine context and reopening the popup in light mode preserved the selected palette. The popup transport remains synthetic. All 115 tests and lint, formatting, TypeScript, production builds, and build-asset checks pass.

The installed extension still needs reloading to activate the new background handler and manifest icons. Actual Chrome toolbar painting, tab-to-tab switching, worker suspension/resume, and Firefox runtime behavior remain unverified; fixture results do not establish those paths.

## Toolbar icon asset resolution

Checked on 2026-10-19 after the toolbar palette failed to follow tab context. In installed Chrome, switching between Godot demo PR #1320 and AR Foundation samples PR #1217 retained the neutral SceneSleuth toolbar title; opening the popup on the Godot tab correctly identified its review. Reloading the Unity page did not restore the engine title. No warning/error entries were captured from that page.

The background worker is packaged at `assets/background.js`, but it passed `icons/...` directly to `action.setIcon`. Chromium's [service-worker icon binding](https://github.com/chromium/chromium/blob/main/extensions/renderer/resources/set_icon.js) fetches those paths relative to the worker, resulting in missing `assets/icons/...` requests. The new regression reproduced that exact missing path before the fix. The controller now resolves every icon through `runtime.getURL` before calling the action API, preserving per-tab state and existing navigation resets.

All 116 tests, lint, formatting, TypeScript, production bundling, and build-asset checks pass. The packaged background IIFE also passed a Node VM check under both API namespaces, validating every emitted icon URL against `dist/`, successful message acknowledgements, independent Godot/Unity tabs, and neutral navigation reset. These checks simulate API behavior; native toolbar painting of the corrected build, worker suspension/resume, and Firefox still require runtime verification. Chrome's automation interface rejects claiming `chrome://extensions`, so applying the rebuilt worker needs a manual extension reload followed by reloading both PR pages.

## Native GitHub review comments in both views

Added a DOM-only bridge between GitHub's native inline markers and structured property/object slots. Native threads and composers remain under their original React-owned parents. Scoped layout rules position them over measured slots, while original view and disposal restore the source table's original display. GitHub owns Markdown, reply/edit controls, drafts, pending-review state, and submission. SceneSleuth issues no comment requests and adds no permissions or dependencies. Per-side source ranges attach multiline comments to their actual property; unmatched or filtered-out lines retain exact before/after labels in the current file's fallback area. Loaded line actions open GitHub's own editor, and unfamiliar marker layouts restore the original view. Source extraction reads `.diff-text`, excluding sibling comment/editor text.

Four Node regressions cover validated before/after anchors, file-local targets, section headers, Godot multiline values, unavailable sides, and nested Unity component/asset values. The `/tests/comments.html` browser fixture uses the production bridge, source extractor, and shadow-root renderer with React-owned synthetic native threads and editors. Verified six marker rectangles against their exact file/side/line slots, distinct values in two files, pointer actions and Tab/Enter activation inside the shadow root, native editor identity and draft preservation across both view switches, local synthetic posting and replies on the correct side, filtered-value fallback, repeated reconciliation, file removal/remount without duplicate mounts, and source-text isolation. Opening a comment on a collapsed section expands it. Disposal restores both native tables, preserves six threads, and leaves no review mounts, switches, or projection attributes. Light/dark fixture checks pass. Chrome visual inspection confirmed the thread/editor placement; a screenshot was saved outside the repository. These controls simulate posting locally, not through GitHub's server.

The authenticated shared browser on public [Godot demo PR #1320](https://github.com/godotengine/godot-demo-projects/pull/1320/changes) supplied the current `.diff-text-cell`, `data-inline-markers`, `data-diff-side`, and `data-add-comment-button` markup. A temporary bundle of the production DOM bridge opened GitHub's real editor on `tile_scene.tscn` after line 12, alongside an editor opened through the native button on line 1. Both editors remained visible at projected slots and were cancelled empty. Cleanup restored the native table and removed the temporary probe. No public comment or review was posted. This verifies the native DOM/editor integration, not the complete installed extension flow. Existing-thread replies, server submission, resolved/outdated threads, draft recovery after native virtualization, and Firefox still need live end-to-end verification. The final installed Chrome build requires a manual extension reload before that verification.

All 120 tests, lint, formatting, TypeScript, production builds, and manifest/classic-script checks pass. The existing Lucide bundler directive warnings remain non-failing. T3's snapshot endpoint repeatedly timed out, so visual verification used the connected Chrome browser; shared-browser interaction and geometry checks remained available. The attempted shared-browser viewport resize left the measured width at 1280 px, so it does not establish a narrow-screen check.
