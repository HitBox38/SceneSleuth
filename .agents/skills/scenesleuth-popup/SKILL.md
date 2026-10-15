---
name: scenesleuth-popup
description: Build or improve SceneSleuth's React extension popup and scene-review presentation, including message-driven state, loading and error feedback, accessibility, and compact layouts. Use for popup UI work rather than manifest or parser implementation alone.
---

# SceneSleuth popup UI

Read the root `AGENTS.md`, `popup/src/App.tsx`, and the message producer in `content_script/content-script.ts`. Use the existing React, Tailwind, Lucide, and UI primitive setup. This is an extension popup, not a Next.js application.

## Design around the review task

Prioritize the current review's scene files and the changes the user can act on. Show full file paths where duplicate basenames would be ambiguous. Keep raw line counts distinct from semantic scene changes. Do not show node or property summaries when the payload contains only filenames and statistics.

For a structured view, preserve old/new values, object identity, and access to the original diff. Make partial input and unsupported scene values understandable without exposing parser internals. Use progressive disclosure for large collections of properties or resources, while retaining useful labels and source context.

Fit the browser popup's constrained viewport. Check long paths, long values, large file lists, scrolling, and text wrapping. Reuse the existing visual language; do not add a design system or animation library for a focused change.

## Make message-driven state explicit

Distinguish loading, ready-with-results, ready-empty, unsupported-page, and error states. Use a bounded wait and recoverable feedback when no content-script receiver exists; distinguish that failure from a successful empty result.

Subscribe and request the initial snapshot in an order that does not drop updates. Ignore stale replies and unrelated-tab messages. Merge or replace results by file identity and review context rather than an array index. Prefer typed messages and a shared domain model over duplicating incompatible interfaces in popup and content code.

Register and clean up browser listeners in effects. Verify cleanup and duplicate subscriptions under React Strict Mode and after popup reopening. Avoid redundant derived state and speculative memoization. The popup should recover its view from a fresh snapshot rather than relying on an earlier instance remaining mounted.

## Accessibility and rendering

Use semantic buttons, headings, lists, and disclosure controls. Give icon-only controls accessible names. Make loading/error updates available to assistive technology without repeatedly announcing an entire diff. Add visible keyboard focus and ensure added/removed status is conveyed in text or symbols as well as color.

Render scene content as text. Do not pass file contents to `dangerouslySetInnerHTML`. Honor reduced-motion preferences if motion is part of the requested UI work. Keep essential state feedback understandable without animation.

## Verification

Exercise the states affected by the change with realistic payloads. Check keyboard use, long filenames, duplicate basenames, empty results, messaging errors, and retry behavior where relevant.

A normal Vite page has no extension runtime. If a task uses a standalone UI fixture, isolate the adapter/mock and do not ship fabricated data as a silent runtime fallback. Verify the real message flow in a loaded extension when the environment supports it, including popup close/reopen and switching active tabs. Report what was mocked and what was tested in the extension.

Run the appropriate lint/build checks from `AGENTS.md`; distinguish existing configuration failures from issues introduced by the UI change.
