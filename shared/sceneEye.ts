import type { EngineTheme } from "./reviewTheme.ts";

export const iconSizes = [16, 24, 32, 48, 64, 128] as const;
export const iconThemes: EngineTheme[] = ["github", "godot", "unity", "unreal"];
export const sceneEyePalette = {
  github: { background: "#171c23", surface: "#252d38", primary: "#bdc6d0", secondary: "#8f9caa" },
  godot: { background: "#101820", surface: "#182d3c", primary: "#78b6e8", secondary: "#9ad9bd" },
  unreal: { background: "#151820", surface: "#25283a", primary: "#b7a7ef", secondary: "#79b6d8" },
  unity: { background: "#171c23", surface: "#242c36", primary: "#e6edf3", secondary: "#7aace8" },
} as const;

// Shared vector geometry for React, standalone SVGs and browser-rasterized PNGs.
export function sceneEyeElements(theme: EngineTheme) {
  const p = sceneEyePalette[theme];
  return [
    { tag: "rect", props: { width: 64, height: 64, rx: 14, fill: p.background } },
    {
      tag: "path",
      props: {
        d: "m32 9 22 13v24L32 58 10 46V22Z",
        fill: p.surface,
        stroke: p.secondary,
        strokeWidth: 3,
        strokeLinejoin: "round",
      },
    },
    {
      tag: "path",
      props: {
        d: "m11 22 21 12 21-12M32 34v23",
        fill: "none",
        stroke: p.secondary,
        strokeWidth: 3,
        strokeLinejoin: "round",
      },
    },
    {
      tag: "path",
      props: {
        d: "M13 32q19-22 38 0-19 22-38 0Z",
        fill: p.primary,
        stroke: p.background,
        strokeWidth: 3,
        strokeLinejoin: "round",
      },
    },
    { tag: "circle", props: { cx: 32, cy: 32, r: 6, fill: p.background } },
  ];
}
export function sceneEyeSvg(theme: EngineTheme): string {
  const shapes = sceneEyeElements(theme)
    .map(
      ({ tag, props }) =>
        `<${tag} ${Object.entries(props)
          .map(
            ([key, value]) =>
              `${key.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase())}="${value}"`,
          )
          .join(" ")}/>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 64 64" role="img" aria-label="SceneSleuth — Scene Eye (${theme})">${shapes}</svg>\n`;
}
export function actionIconPaths(theme: EngineTheme): Record<string, string> {
  return Object.fromEntries(
    iconSizes.map((size) => [String(size), `icons/${theme}/icon-${size}.png`]),
  );
}
export function actionIconTitle(theme: EngineTheme): string {
  return theme === "github"
    ? "SceneSleuth"
    : `SceneSleuth · ${theme === "unreal" ? "Unreal" : theme === "unity" ? "Unity" : "Godot"} review`;
}
