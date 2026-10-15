---
name: godot-scene-diffs
description: Implement or review Godot .tscn parsing and semantic scene comparisons in SceneSleuth. Use for nodes, resources, properties, signal connections, scene identity, and incomplete GitHub diff hunks; not for general GDScript gameplay development.
---

# Godot scene diffs

Read the root `AGENTS.md` and trace which parser the caller actually uses. The repository has experiments in `content_script/scripts/` and `content_script/second_try/`; a new model should replace or integrate a chosen path rather than create another disconnected parser.

## Establish what the input proves

Distinguish complete scene snapshots from GitHub diff hunks. Added lines alone are not the new scene, and deleted lines alone are not the old scene. An unchanged section header may be absent while its property changes appear in the hunk.

For complete versions, parse each side before comparing. For partial input, retain hunk boundaries, context lines, old/new line numbers, and unknown ownership. Do not merge separated hunks as if they were contiguous scene text. Missing context must not become a fabricated deletion, node assignment, or resolved resource.

If the requested feature needs complete scenes, make that dependency explicit in the design. Do not silently introduce authenticated API access or claim a partial extraction is complete.

## Model scene structure and source separately

Keep separate fields for:

- Section kind: scene header, external resource, subresource, node, or connection.
- Godot class or resource type, when declared.
- Diff operation: added, removed, or modified.
- Identity, properties, references, and source locations.

The existing code overloads `type` in places; preserve these meanings when redesigning it. Attach properties to their owning section. Retain exact source and diagnostics for unsupported values instead of losing information during coercion.

Verify the relevant Godot version and serialized syntax against fixtures and the [official TSCN format documentation](https://docs.godotengine.org/en/stable/engine_details/file_formats/tscn.html) when extending syntax support. Select the documentation version matching the input; stable documentation alone is not proof that every older scene uses the same syntax. Treat the following as design checks, not a complete grammar:

- Track strings and escaping when finding separators; values can contain spaces, `=`, commas, or brackets.
- Accumulate multiline arrays, dictionaries, and constructors without treating delimiters inside strings as structure.
- Preserve references such as `ExtResource(...)` and `SubResource(...)` as references; resolve them only when their declarations are available.
- Preserve unfamiliar constructors as opaque values with source text. Do not evaluate serialized expressions.
- Use parent path plus name to distinguish nodes when available; a name alone is not globally unique.
- Compare resource identifiers in context. Rewritten identifiers do not by themselves prove a resource's contents changed; avoid speculative rename matching.
- Include connection identity and attributes when connection comparisons are in scope.

## Compare and present evidence

Separate extraction, parsing, identity matching, semantic comparison, and rendering. A comparison should retain old and new values and link back to source lines where available. Keep line-count statistics distinct from semantic change counts.

Ignore only formatting that the parser can establish is insignificant. Preserve ordering where it affects values. When identity or value interpretation is uncertain, expose the raw change rather than presenting an unjustified semantic conclusion.

## Verify with small fixtures

Choose focused examples for the changed behavior: property changes under unchanged headers, duplicate node names under different parents, referenced resources, multiline values, quoted delimiters, or disconnected hunks. Include both an observable expected change and an unchanged case that should not be reported.

Use minimal excerpts derived from `test.html` for DOM extraction tests; keep pure scene parsing tests independent of the DOM and extension APIs. No test runner is configured yet, so choose one only when implementation work warrants it. Report supported constructs and partial-input limits precisely.
