# SceneSleuth

**See the scene behind the diff.**

SceneSleuth helps Godot and Unity developers review serialized scenes and assets in GitHub pull requests. It supports Godot `.tscn`, `.tres`, `.godot`, and `.import` files, plus Unity text-serialized `.unity`, `.prefab`, `.asset`, `.mat`, `.meta`, `.controller`, `.overrideController`, and `.anim` files. Instead of reconstructing changes from serialized lines, you can inspect nodes, resources, properties, signal connections, and project settings directly in each file’s diff area.

The goal is to answer **“What changed in this scene or asset?”** without opening the project in the editor.

## What you can do

Open a pull request’s **Files changed** tab. SceneSleuth automatically replaces each loaded supported file’s diff body with a structured review. GitHub’s file header and review controls stay in place. The toolbar popup summarizes the current tab; **Go to Godot changes**, **Go to Unity changes**, or the combined action scrolls to an inline review.

The inline review follows GitHub’s active color theme, with Godot-inspired scene-type icons, left-hand disclosure arrows, and compact inspector rows. Nodes, resources, and signals have distinct icon colors; before/after values use GitHub’s diff colors. The header switch and image previews share the same theme. The standalone toolbar popup uses a matching dark palette.

- Browse scene files and their changed sections, with node paths and Godot classes.
- Review Unity `.anim` clips with grouped tracks/keyframes, events, and clip settings, including sample rate and serialized looping options. Curve keys, slopes, paths, and event parameters expand as YAML trees; compressed payloads remain source text. This is a property review, without animation playback or plotted curves.
- Review Unity `.overrideController` base-controller references and original/replacement clip pairs in a dedicated clip-replacements group. Available GUID mappings provide navigation; the base controller is not expanded into this file.
- Inspect Unity `.controller` animation state machines as serialized objects, with named local state references and grouped parameters, layers, transition destinations, conditions, and timing. Nested blend trees retain their available properties; no runtime animation graph is evaluated.
- Review Unity `.meta` files by file metadata and importer, including nested texture, sprite, model, audio, and platform settings. Root GUIDs remain visible, and nested fragments with missing importer context stay unresolved.
- Inspect Unity `.mat` materials, including shader and texture references, saved property collections, nested color swatches, and exact numeric values. Material properties use the bounded YAML tree; unavailable shader defaults are not inferred.
- Review Unity scenes, prefabs, and text assets by GameObject, component, and other serialized object. File IDs remain exact, components show their known GameObject owner, Transform values use labeled components, and collections expand as YAML trees. Prefab overrides and stripped objects remain explicit source properties; the review does not instantiate a prefab. Unity assets retain their declared serialized type.
- Resolve Unity’s local `fileID` references from objects present in the same file’s available diff. GUID references gain filenames, PR navigation, repository links, and image previews when a loaded `.meta` diff identifies that asset path on the matching side. Metadata also has its own structured import-settings review. Unmapped GUIDs retain their original reference text.
- Review Godot source-asset `.import` sidecars by Remap, Dependencies, and Parameters, including nested configuration values and source-file references. The generated `.godot/` directory is excluded from structured reviews. Configuration files contribute settings counts rather than node/resource counts.
- Review `project.godot` settings under their own sections, including Application, Autoload, Input, and Rendering. Global file settings, slash-separated keys, multiline descriptions, and input-event dictionaries retain their original values. The header uses **Settings / Original diff**, and settings have their own search and popup count. Direct `res://` values link to files and support image previews; autoload singleton markers remain visible. Unresolved `uid://` values and unfamiliar expressions stay as source text. Text `.godot` configurations are supported; binary `.res` resources and GDScript remain native diffs.
- Inspect `.tres` text resources such as materials, TileSets, animations, and custom resources. The **Resource / Original diff** switch shows the main `[resource]` properties separately from embedded resources and file metadata. Resource references, image previews, numeric value formatting, and expandable collection values use the same review controls as scenes.
- Compare property values before and after in compact, read-only inspector rows. Common 2D/3D node properties use collapsible Transform, Visibility, and Collision groups. Property names are readable labels, with their serialized names on hover; source links and change markers remain available beside them.
- Expand JSON-like Godot dictionaries, arrays, and serialized objects as compact trees. Input actions expose their deadzone, event list, and individual event fields; replication dictionaries expose nested keys and values. Both sides keep their own tree, collection counts, and **Serialized value** disclosure with exact source text. Nested scene references retain their links and image previews. Truncated, commented, oversized, and unsupported collections keep the raw-text view; typed and packed array constructors remain source text.
- Inspect simple numeric vectors as labeled x/y/z/w components and normalized RGBA colors as swatches with exact channel values. Hover a formatted value for its original expression. Unsupported expressions, HDR colors, and missing values retain their source or missing-value presentation. Before/After headings appear once per file, and familiar node classes have distinct icons.
- See referenced nodes, scenes, scripts, textures, and embedded resources by name instead of serialized IDs. Relative node paths resolve within the file, and references inside arrays and dictionaries resolve too. Hover a name for its target and original expression; both sides keep their own targets. Search also matches the resolved names and paths.
- Click a referenced file to jump to its PR diff, including scripts, images, and files whose text has not loaded yet. Files outside the selected comparison open in the repository at the corresponding before/after commit. Links support keyboard activation and the browser’s usual open-in-new-tab actions.
- Hover or keyboard-focus an image filename for a preview, with transparency shown against a checkerboard and the image dimensions below it. Previews load from GitHub only when opened and use the corresponding before/after revision. Clicking the filename still navigates to the file. Unavailable previews show a fallback message.
- Filter Godot nodes/resources/signals or Unity GameObjects/components/other objects, and search names, properties, and values.
- Expand resources and inspect the original patch text when you need more detail.
- Switch between **Scene**, **Resource**, **Settings**, **Prefab**, or **Asset** and **Original diff** independently for each file using the control in GitHub’s file header, between Copilot and Viewed. The scene body starts with filters and search on one compact row; project settings and text resources start with search. These layouts wrap on narrow screens and omit extra brand, counts, or context-explanation rows. Use the original view for GitHub line comments; source-line links reveal that view automatically.
- Each inline view shows only its own file’s objects, settings, properties, embedded resources, and signals. Referenced script, image, and scene files are not displayed as separate cards. References remain readable as property values, and their declarations remain in **Original diff**. When GitHub reuses a diff table for another file, SceneSleuth replaces the old view rather than carrying its values over.
- Keep GitHub’s file navigation, Viewed checkboxes, and review controls. Other file types keep their original diffs, and SceneSleuth never submits reviews.

Private repositories work through your existing GitHub sign-in. SceneSleuth reads the current page’s review data and rendered diff tables. There is no backend, API token, analytics, or external scene upload.

The content script starts on GitHub pages so it can detect GitHub’s navigation into a PR without a full reload. It reads scene review data and displays its UI only on PR pages.

## Important limits

This is an early development build, not a published extension.

**A diff is not a complete file.** Modified reviews contain diff context only; unchanged sections may be missing. A missing value means that value is absent from the available hunk, not necessarily absent from the scene, resource, or configuration. If a section header is outside the hunk, changes appear under **Unresolved scene context**, **Unresolved resource context**, **Unresolved settings context**, or **Unresolved Unity context** rather than being assigned to a guessed owner. Complete coverage is established only for complete added/deleted file patches. Configuration defaults are not inferred or evaluated.

GitHub loads some file diffs lazily. Those files appear as waiting for text in the toolbar popup. Select the file in GitHub and use its load control if needed. SceneSleuth replaces the diff body once its table and text are available, and retains loaded results within the current review. Summary counts cover changed objects and properties in parsed text only. If parsing is unavailable, GitHub’s original diff stays visible.

During navigation without a page reload, GitHub can retain the initial page’s embedded data. SceneSleuth rejects data from a different route and reads the current rendered tables instead. In that case the popup labels its results as **loaded Godot files**, **loaded Unity files**, or both, since more files may appear as you browse. Those tables provide diff context only; they do not establish complete file contents or file creation/rename metadata.

The adapter targets GitHub’s modern **Files changed** layout. GitHub’s markup and embedded data are not a stable public API; unsupported layouts produce a recoverable message. Very large or GitHub-limited diffs may remain partial. There is no full scene preview, inherited-scene expansion, Godot/Unity execution, or speculative matching of renamed nodes/resource identifiers. References resolve only from declarations available in that file’s diff context. Missing targets, absolute/unique node paths, and node paths inside animation resources retain their original text. Other constructors remain source text; no values are evaluated.

File links and image previews resolve Godot’s `res://` paths inside the nearest parent project whose `project.godot` is listed in the PR. This supports repositories containing several Godot projects and keeps each scene’s references in its own project. If no project marker is available in the comparison, the repository root remains the fallback; unchanged nested project markers are not discovered automatically. Relative resource paths resolve beside the scene file. During DOM-only navigation, PR links cover the file tree and diffs discovered so far. When GitHub omits comparison commit IDs, repository links use `HEAD` (the default branch) instead of claiming an exact revision. Nodes and embedded resources remain local values, without repository links.

Unity support requires text serialization. Binary assets, rendered scene previews, inherited prefab expansion, automatic repository-wide GUID lookup, and matching regenerated file IDs are outside this phase. A GUID without an unambiguous loaded `.meta` mapping remains unresolved, including references to Unity/package built-ins. Nested property fragments without their parent stay raw; collection values cut off at a hunk boundary keep their source with an uncertainty note. Unsupported YAML tags, aliases, duplicate keys, excessive nesting, and oversized values stay raw. No YAML expressions, scripts, or constructors are executed. Unchanged YAML patches are cached only within the current PR comparison; changing source, routes, or comparisons invalidates them.

Image previews support browser image formats: PNG/APNG, JPEG, GIF, WebP, SVG, AVIF, BMP, and ICO. Formats such as TGA and Godot’s imported texture files keep normal file links. Private image access uses the existing GitHub sign-in; no additional permissions or external image service are required.

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
4. Select a supported Godot or Unity file in GitHub’s file list. Its diff body shows the structured review; **Original diff** restores GitHub’s text view.

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

The tests use Node’s built-in test runner and TypeScript stripping; Node 22 may print an experimental warning. No separate test framework is installed. Committed regression fixtures are synthetic; do not add private game source or captured authenticated GitHub pages to this repository.

The standalone popup displays setup guidance when extension APIs are absent. It does not fabricate review data. Actual injection, permissions, messaging, navigation, and popup reopening require a loaded extension.

For repeatable UI checks, open `/tests/browser.html` on the Vite development server. The synthetic inline fixture mounts the actual shadow-root review beside a preserved source table and file header. Exercise the view toggle, keyboard controls, filters, search, repeated processing, table remounts, delayed files, and cleanup with its controls. A standalone inspector below it covers loading, empty, and error states. The fixture is excluded from the production build and does not establish installed-extension integration.

The fixture’s **Image preview states** control covers before/after graphics and failed image loads. A service worker scoped to `/tests/` serves synthetic images for `example/game` URLs only; it is never registered or included by the extension.

### Source map

- `content_script/content-script.ts`: page lifecycle, review cache, and popup messaging.
- `content_script/scripts/githubReview.ts`: normalize GitHub’s embedded review data.
- `content_script/scripts/githubDom.ts`: collect additionally rendered diff tables.
- `content_script/scripts/diffParser.ts`: unified patches, hunk boundaries, and source lines.
- `content_script/scripts/contentParser.ts`: Godot sections, lexical values, identities, and shared comparisons.
- `content_script/scripts/unityParser.ts`: Unity document identities, properties, and local references.
- `shared/unityYaml.ts`, `shared/unityMeta.ts`: bounded YAML syntax inspection and side-specific metadata evidence.
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
