import { defineConfig } from "vite";
export default defineConfig({
  build: {
    emptyOutDir: false,
    target: "es2022",
    lib: {
      entry: "./background/background.ts",
      name: "SceneSleuthIcons",
      formats: ["iife"],
      fileName: () => "assets/background.js",
    },
  },
});
