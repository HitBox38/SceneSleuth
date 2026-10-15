import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    emptyOutDir: false, // So that popup and content build files don't get deleted
    target: "es2022",
    rolldownOptions: {
      input: {
        background: "./background/background.ts", // Entry Point
      },
      output: {
        entryFileNames: "assets/[name].js",
      },
    },
  },
});
