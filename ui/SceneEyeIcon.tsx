import { createElement } from "react";
import { sceneEyeElements } from "../shared/sceneEye.ts";
import type { EngineTheme } from "../shared/reviewTheme.ts";

export function SceneEyeIcon({
  theme = "github",
  size = 36,
}: {
  theme?: EngineTheme;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      data-scenesleuth-icon={theme}
    >
      {sceneEyeElements(theme).map(({ tag, props }, index) =>
        createElement(tag, { ...props, key: index }),
      )}
    </svg>
  );
}
