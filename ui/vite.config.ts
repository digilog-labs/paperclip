import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createUiDevWatchOptions } from "./src/lib/vite-watch";

const lowMemBuild = process.env.CLOUDTYPE_BUILD === "1";

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  build: {
    minify: "esbuild",
    sourcemap: false,
    reportCompressedSize: !lowMemBuild,
    rollupOptions: lowMemBuild
      ? {
          maxParallelFileOps: 2,
          output: {
            manualChunks(id) {
              if (!id.includes("node_modules")) return;
              if (id.includes("mermaid")) return "vendor-mermaid";
              if (id.includes("@mdxeditor") || id.includes("/lexical/")) return "vendor-editor";
              if (id.includes("@assistant-ui")) return "vendor-assistant";
              if (id.includes("react-dom") || id.includes("/react/")) return "vendor-react";
              return "vendor";
            },
          },
        }
      : undefined,
  },
  esbuild:
    mode === "production"
      ? {
          drop: ["console", "debugger"],
          legalComments: "none",
        }
      : undefined,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      lexical: path.resolve(__dirname, "./node_modules/lexical/Lexical.mjs"),
    },
  },
  server: {
    port: 5173,
    watch: createUiDevWatchOptions(process.cwd()),
    proxy: {
      "/api": {
        target: "http://localhost:3100",
        ws: true,
      },
    },
  },
}));
