import { mkdirSync, writeFileSync } from "node:fs";
import { iconThemes, sceneEyeSvg } from "../shared/sceneEye.ts";
const target = new URL("../public/icons/", import.meta.url);
mkdirSync(target, { recursive: true });
for (const theme of iconThemes)
  writeFileSync(new URL(`scene-eye-${theme}.svg`, target), sceneEyeSvg(theme));
writeFileSync(new URL("scene-eye.svg", target), sceneEyeSvg("github"));
