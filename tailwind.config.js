/** Web3 Bento 预览页专用 Tailwind 配置。只扫描该页相关文件，避免影响套件中心构建。 */
export default {
  content: [
    "./web3.html",
    "./src/web3-main.tsx",
    "./src/Web3Bento.tsx",
  ],
  theme: {
    extend: {
      colors: {
        border: "var(--color-border)",
        foreground: "var(--color-foreground)",
        background: "var(--color-background)",
        card: "var(--color-card)",
        "card-foreground": "var(--color-card-foreground)",
        muted: "var(--color-muted)",
        "muted-foreground": "var(--color-muted-foreground)",
        ring: "var(--color-ring)",
      },
    },
  },
  plugins: [],
};
