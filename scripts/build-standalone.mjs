#!/usr/bin/env node
/**
 * 把 npm run build 生成的 dist/ 打包为单文件 webroot/index.html。
 * 用法：npm run build && node scripts/build-standalone.mjs
 * 说明：Vite 已把 CSS 注入 JS（cssCodeSplit:false + React 内联样式），
 *      因此这里只需把 <script src> 替换成内联 <script> 即可。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distHtml = resolve(root, "dist/index.html");
const outHtml = resolve(root, "webroot/index.html");

if (!existsSync(distHtml)) {
  console.error("[x] 未找到 dist/index.html，请先运行 npm run build");
  process.exit(1);
}

let html = readFileSync(distHtml, "utf8");
const scriptRe = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/g;
let count = 0;
html = html.replace(scriptRe, (_m, src) => {
  const asset = resolve(root, "dist", src.replace(/^\.\//, ""));
  if (!existsSync(asset)) {
    console.error(`[x] 资源不存在：${asset}`);
    process.exit(1);
  }
  const js = readFileSync(asset, "utf8");
  count++;
  // 避免 JS 中出现 </script> 提前闭合
  return "<script type=\"module\">" + js.replace(/<\/script>/gi, "<\\/script>") + "</script>";
});

mkdirSync(dirname(outHtml), { recursive: true });
writeFileSync(outHtml, html, "utf8");
console.log(`[ok] 已内联 ${count} 个脚本 -> ${outHtml}`);
console.log(`[i] 文件大小 ${Buffer.byteLength(html, "utf8")} 字节`);
