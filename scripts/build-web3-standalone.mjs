#!/usr/bin/env node
/**
 * 把 dist-web3/ 打包为单文件 webroot/web3.html。
 * 用法：npx vite build --config vite.web3.config.ts && node scripts/build-web3-standalone.mjs
 * Vite(cssCodeSplit:false) 已把 CSS 收集到单个样式文件、JS 单个 chunk，这里全部内联。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(root, "dist-web3");
const distHtml = resolve(distDir, "web3.html");
const outHtml = resolve(root, "webroot/web3.html");

if (!existsSync(distHtml)) {
  console.error("[x] 未找到 dist-web3/web3.html，请先运行 vite build --config vite.web3.config.ts");
  process.exit(1);
}

let html = readFileSync(distHtml, "utf8");

// 内联 <link rel=stylesheet>
const cssRe = /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/g;
html = html.replace(cssRe, (_m, href) => {
  const asset = resolve(distDir, href.replace(/^\.\//, "").replace(/^\//, ""));
  if (!existsSync(asset)) {
    console.error(`[x] CSS 不存在：${asset}`);
    process.exit(1);
  }
  return `<style>${readFileSync(asset, "utf8")}</style>`;
});

// 内联 <script src>
const jsRe = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/g;
let jsCount = 0;
html = html.replace(jsRe, (_m, src) => {
  const asset = resolve(distDir, src.replace(/^\.\//, "").replace(/^\//, ""));
  if (!existsSync(asset)) {
    console.error(`[x] JS 不存在：${asset}`);
    process.exit(1);
  }
  jsCount++;
  const js = readFileSync(asset, "utf8");
  return `<script type="module">${js.replace(/<\/script>/gi, "<\\/script>")}</script>`;
});

mkdirSync(dirname(outHtml), { recursive: true });
writeFileSync(outHtml, html, "utf8");
console.log(`[ok] 已内联 ${jsCount} 个脚本 -> ${outHtml}`);
console.log(`[i] 文件大小 ${Buffer.byteLength(html, "utf8")} 字节`);
