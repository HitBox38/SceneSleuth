import { defineConfig } from "vite";
export default defineConfig({
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  oxc: { jsx: { runtime: "automatic" } },
  build: {
    emptyOutDir: false,
    target: "es2022",
    lib: {
      entry: "./content_script/content-script.ts",
      name: "SceneSleuthContent",
      formats: ["iife"],
      fileName: () => "assets/content.js",
    },
  },
});
