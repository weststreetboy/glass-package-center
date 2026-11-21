import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Web3 Bento 预览页独立构建链：单独入口、单独输出目录，不触碰套件中心 dist/。
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist-web3",
    assetsDir: "assets",
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(process.cwd(), "web3.html"),
      output: { manualChunks: undefined },
    },
  },
});
