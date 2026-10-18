# Context-aware SVG concepts

These five designs are candidates, not the installed extension icon. No design has been selected yet.

Each main SVG inherits `data-ss-engine="godot"`, `"unity"`, or `"github"` from an ancestor when embedded inline, or accepts that attribute on its own root. Its geometry is identical across contexts. The root-level copies default to neutral GitHub colors when no context is available.

The `godot/`, `unity/`, and `github/` folders contain standalone SVG variants with an explicit context for image viewers and downloads. Open `index.html` to compare them, switch the simulated PR context, and inspect 16/24 px toolbar previews on light and dark backgrounds.

Godot uses blue and mint; Unity uses off-white and selection blue; mixed/unknown contexts use neutral grays. After selecting a design, the installed icon should follow the existing `reviewTheme(snapshot)` result, which already handles repository detection and mixed/unknown contexts. The concepts themselves do not change browser action behavior.
