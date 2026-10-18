import { iconThemes, iconSizes, sceneEyeSvg, actionIconPaths } from "../shared/sceneEye.ts";
import type { EngineTheme } from "../shared/reviewTheme.ts";

export async function exportIcons(theme: EngineTheme): Promise<Record<string, string>> {
  const url = URL.createObjectURL(new Blob([sceneEyeSvg(theme)], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const assets: Record<string, string> = {};
    for (const size of iconSizes) {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable.");
      context.drawImage(image, 0, 0, size, size);
      assets[actionIconPaths(theme)[size]] = canvas.toDataURL("image/png");
    }
    return assets;
  } finally {
    URL.revokeObjectURL(url);
  }
}
const target = document.querySelector("#icons")!;
for (const theme of iconThemes) {
  const section = document.createElement("section");
  section.style.cssText =
    "display:inline-flex;flex-direction:column;gap:16px;margin:16px;padding:20px;background:#f0f2f5;border:1px solid #ccd3db;border-radius:12px";
  const title = document.createElement("strong");
  title.textContent = theme;
  section.append(title);
  const image = document.createElement("img");
  image.src = `data:image/svg+xml,${encodeURIComponent(sceneEyeSvg(theme))}`;
  image.width = 128;
  image.height = 128;
  image.alt = `Scene Eye (${theme})`;
  section.append(image);
  const button = document.createElement("button");
  button.textContent = "Download PNG bundle";
  button.addEventListener("click", () => {
    void exportIcons(theme).then((assets) => {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(
        new Blob([JSON.stringify(assets)], { type: "application/json" }),
      );
      link.download = `scene-eye-${theme}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
    });
  });
  section.append(button);
  target.append(section);
}
