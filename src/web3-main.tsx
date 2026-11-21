import React from "react";
import { createRoot } from "react-dom/client";
import Web3Bento from "./Web3Bento";
import "./web3.css";

(function bindTheme() {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  let theme: "light" | "dark" = mq.matches ? "dark" : "light";
  const apply = () => {
    document.documentElement.setAttribute("data-w3-theme", theme);
    btn.textContent = theme === "dark" ? "\u2600" : "\u263E";
  };
  const btn = document.createElement("button");
  btn.className = "w3-theme-toggle";
  btn.setAttribute("aria-label", "切换明暗主题");
  btn.title = "切换明暗主题";
  btn.onclick = () => {
    theme = theme === "dark" ? "light" : "dark";
    apply();
  };
  mq.addEventListener("change", (e) => {
    theme = e.matches ? "dark" : "light";
    apply();
  });
  apply();
  document.body.appendChild(btn);
})();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div className="w3-stage">
      <Web3Bento />
    </div>
  </React.StrictMode>
);
