import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: "esnext",
    rolldownOptions: {
      input: {
        popup: "./popup/index.html",
      },
      output: {
        entryFileNames: "assets/[name].js",
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./popup/src", import.meta.url)),
    },
  },
});
