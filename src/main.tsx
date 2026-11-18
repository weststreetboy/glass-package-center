import React from "react";
import { createRoot } from "react-dom/client";
import PackagesWorkspace from "./PackagesWorkspace";
import DoodleCrewFooter from "./DoodleCrewFooter";

const hostTokens = `
:root {
  color-scheme: light;
  --color-background: #e9eef6;
  --color-foreground: #121826;
  --color-muted-foreground: #6b7280;
  --color-muted: #9aa3b2;
  --color-primary: #2563eb;
  --color-primary-foreground: #ffffff;
  --color-secondary: #dfe6f2;
  --color-secondary-foreground: #1f2937;
  --color-border: #cbd5e1;
  --color-input: #ffffff;
  --color-card: #ffffff;
  --color-popover: #ffffff;
  --color-highlight: #2563eb;
  --color-highlighttext: #ffffff;
}
html[data-host-theme="dark"] {
  color-scheme: dark;
  --color-background: #0b1020;
  --color-foreground: #e8edf7;
  --color-muted-foreground: #9aa6bd;
  --color-muted: #64748b;
  --color-primary: #60a5fa;
  --color-primary-foreground: #08111f;
  --color-secondary: #27324a;
  --color-secondary-foreground: #e8edf7;
  --color-border: #334155;
  --color-input: #1b2437;
  --color-card: #161f33;
  --color-popover: #1a2438;
  --color-highlight: #60a5fa;
  --color-highlighttext: #08111f;
}
html, body, #root { height: 100%; }
body { margin: 0; }
`;
const styleEl = document.createElement("style");
styleEl.textContent = hostTokens;
document.head.appendChild(styleEl);

const backgroundImage =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100" viewBox="0 0 1600 1100">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#dbeafe"/>
      <stop offset="0.5" stop-color="#e6e6fa"/>
      <stop offset="1" stop-color="#fce7f3"/>
    </linearGradient>
    <filter id="b"><feGaussianBlur stdDeviation="72"/></filter>
  </defs>
  <rect width="1600" height="1100" fill="url(#bg)"/>
  <g filter="url(#b)">
    <circle cx="260" cy="180" r="300" fill="#93c5fd" opacity="0.8"/>
    <circle cx="1360" cy="140" r="330" fill="#c4b5fd" opacity="0.75"/>
    <circle cx="1180" cy="960" r="360" fill="#f9a8d4" opacity="0.7"/>
    <circle cx="220" cy="900" r="300" fill="#a7f3d0" opacity="0.65"/>
  </g>
</svg>`);

// 全站只保留一层背景：固定在视口上的渐变图 + 22% 底色遮罩。
// 主工作区与页脚共用它，避免两处各自裁切图片导致交界处出现色带。
const pageBackdrop = document.createElement("style");
pageBackdrop.textContent = `
html { background-color: var(--color-background); }
body { background: transparent; }
#root { position: relative; z-index: 1; }
.gpc-backdrop {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}
.gpc-backdrop img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 56%;
}
.gpc-backdrop span {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--color-background) 22%, transparent);
}
html[data-host-theme="dark"] .gpc-backdrop span {
  background: color-mix(in srgb, var(--color-background) 58%, transparent);
}
`;
document.head.appendChild(pageBackdrop);

(function bindHostTheme() {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  let hostTheme: "light" | "dark" = mq.matches ? "dark" : "light";
  const btn = document.createElement("button");
  btn.setAttribute("aria-label", "切换明暗主题");
  btn.title = "切换明暗主题";
  Object.assign(btn.style, {
    position: "fixed", right: "14px", bottom: "14px", zIndex: "9999",
    width: "36px", height: "36px", borderRadius: "50%",
    border: "1px solid rgba(128,128,128,.45)",
    background: "rgba(127,127,127,.18)", backdropFilter: "blur(10px)",
    color: "CanvasText", cursor: "pointer", fontSize: "16px", lineHeight: "1",
  });
  const apply = () => {
    document.documentElement.setAttribute("data-host-theme", hostTheme);
    btn.textContent = hostTheme === "dark" ? "\u2600" : "\u263E";
  };
  btn.onclick = () => {
    hostTheme = hostTheme === "dark" ? "light" : "dark";
    apply();
  };
  mq.addEventListener("change", (e) => {
    hostTheme = e.matches ? "dark" : "light";
    apply();
  });
  apply();
  document.body.appendChild(btn);
})();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <>
      <div className="gpc-backdrop" aria-hidden="true">
        <img src={backgroundImage} alt="" />
        <span />
      </div>
      <PackagesWorkspace
        brand="套件中心"
        backgroundImage={backgroundImage}
        theme="system"
        useHostTheme={true}
      />
      <DoodleCrewFooter className="gpc-art-footer" />
    </>
  </React.StrictMode>,
);
