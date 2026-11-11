import { defineConfig } from "vite";

export default defineConfig({
  base: "./", // relativní cesty: funguje v kořeni domény i v podsložce
  optimizeDeps: {
    // manifold-3d používá top-level await a hledá .wasm přes import.meta.url – nepředbalovat
    exclude: ["manifold-3d"],
  },
  worker: {
    format: "es",
  },
  build: {
    target: "esnext", // top-level await (manifold-3d), moderní prohlížeče
    chunkSizeWarningLimit: 1500,
  },
});
