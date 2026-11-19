"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import {
  ArrowDownToLine,
  ArrowRight,
  Bell,
  Check,
  ChevronRight,
  CircleCheck,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  Home,
  Layers,
  Moon,
  Package,
  Pencil,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  X,
  Boxes,
  Info,
  HardDrive,
  Hammer,
} from "lucide-react";
import { styles } from "./gw-styles";
import { PACKAGES, SOURCE, type Pkg } from "./packages.data";
import SpkStudio from "./SpkStudio";
import PackageUpload from "./PackageUpload";

gsap.registerPlugin(useGSAP);

export type GlassSettings = {
  blur: number;
  opacity: number;
  saturation: number;
  tint: string;
  edge: number;
};

const defaults: GlassSettings = {
  blur: 22,
  opacity: 0.3,
  saturation: 1.2,
  tint: "#ffffff",
  edge: 0.6,
};

const tabs = [
  { id: "browse", label: "套件", icon: Home },
  { id: "studio", label: "打包", icon: Hammer },
  { id: "installed", label: "已收录", icon: Boxes },
  { id: "source", label: "套件来源", icon: Layers },
  { id: "about", label: "关于", icon: Info },
] as const;
type View = (typeof tabs)[number]["id"];

const CATS = ["全部", "网络", "多媒体", "工具", "系统", "开发", "安全"] as const;
const ARCHS = ["x86_64", "armv8", "noarch"] as const;
const PKG_LABELS: Record<string, string> = {
  HelloPkg: "基础示例包",
  LocalDemo: "本地测试包",
  sspksrepo: "自托管套件中心",
};
const displayPkgId = (p: Pkg) => PKG_LABELS[p.en] ?? p.en;

const SOURCE_KEY = "wb_gpc_source_url";
type SourceCfg = {
  url: string;
  note: string;
  custom: boolean;
  origin: "link" | "saved" | "default";
};

function normalizeSourceUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)
    ? value
    : `http://${value}`;
  try {
    const u = new URL(candidate);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}

function currentSiteUrl(): string {
  // 部署后默认把「当前站点根地址」作为套件来源，避免一直显示写死的演示地址。
  // 仅file://（本地双击打开）回退到演示地址；http(s) 一律用当前 origin + pathname。
  try {
    const u = new URL(window.location.href);
    if (u.protocol === "http:" || u.protocol === "https:") {
      const path = u.pathname.replace(/\/index\.html$/i, "").replace(/\/+$/, "");
      return `${u.origin}${path}/`;
    }
  } catch {
    /* ignore */
  }
  return "";
}

function readSource(): SourceCfg {
  const site = currentSiteUrl();
  const fallback: SourceCfg = site
    ? {
        url: site,
        note: `此地址为当前站点的访问地址，自动识别。若你的 SSPKS 源是另一个地址，请点「修改」直接填写并保存；DSM 套件中心需在 NAS 本机添加来源。`,
        custom: false,
        origin: "default",
      }
    : {
        url: SOURCE.url,
        note: SOURCE.note,
        custom: false,
        origin: "default",
      };
  try {
    const params = new URLSearchParams(window.location.search);
    let fromLink = false;
    if (params.has("source")) {
      const next = normalizeSourceUrl(params.get("source") || "");
      if (next) {
        window.localStorage.setItem(SOURCE_KEY, next);
        fromLink = true;
      }
      try {
        const clean = new URL(window.location.href);
        clean.searchParams.delete("source");
        window.history.replaceState(
          null,
          "",
          `${clean.pathname}${clean.search}${clean.hash}`,
        );
      } catch {
        /* file:// 等场景可能不允许改写地址，忽略 */
      }
    }
    const saved = normalizeSourceUrl(
      window.localStorage.getItem(SOURCE_KEY) || "",
    );
    if (saved) {
      return {
        url: saved,
        note: `当前地址来自${fromLink ? "本次访问链接" : "本机保存的设置"}，只存在此浏览器里；DSM 套件中心需在 NAS 本机添加来源。点「重置」恢复默认演示地址。`,
        custom: true,
        origin: fromLink ? "link" : "saved",
      };
    }
    return fallback;
  } catch {
    return fallback;
  }
}

const bounded = (value: number, min: number, max: number, fallback: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const normalize = (v: Partial<GlassSettings>): GlassSettings => ({
  blur: bounded(v.blur ?? defaults.blur, 0, 40, defaults.blur),
  opacity: bounded(v.opacity ?? defaults.opacity, 0.08, 0.9, defaults.opacity),
  saturation: bounded(
    v.saturation ?? defaults.saturation,
    0.5,
    2,
    defaults.saturation,
  ),
  edge: bounded(v.edge ?? defaults.edge, 0, 1, defaults.edge),
  tint: /^#[0-9a-f]{6}$/i.test(v.tint ?? "") ? v.tint! : defaults.tint,
});

function ArchIcon({ arch }: { arch: string }) {
  return arch === "noarch" ? <ShieldCheck size={14} aria-hidden="true" /> : <Cpu size={14} aria-hidden="true" />;
}

export default function PackagesWorkspace({
  brand = "套件中心",
  userName,
  backgroundImage,
  className = "",
  style,
  useHostTheme = true,
  theme = "system",
}: {
  brand?: string;
  userName?: string;
  backgroundImage?: string;
  className?: string;
  style?: CSSProperties;
  useHostTheme?: boolean;
  theme?: "system" | "light" | "dark";
}) {
  const root = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const id = useId().replace(/:/g, "");
  const [view, setView] = useState<View>("browse");
  const [material, setMaterial] = useState(() => normalize(defaults));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [localTheme, setLocalTheme] = useState(theme);
  const [filter, setFilter] = useState("");
  const [cat, setCat] = useState<string>("全部");
  const [arch, setArch] = useState<string>("全部");
  const [channel, setChannel] = useState<string>("全部");
  const [notice, setNotice] = useState("");
  const [alerts, setAlerts] = useState(false);
  const [selected, setSelected] = useState<Pkg | null>(null);
  const [source, setSource] = useState<SourceCfg>(readSource);
  const [editingSource, setEditingSource] = useState(false);
  const [sourceDraft, setSourceDraft] = useState("");
  // 运行时列表：容器内的服务返回内置 + 上传 + 扫描到的套件；静态打开时回落到内置数据
  const [pkgs, setPkgs] = useState<Pkg[]>(PACKAGES);
  const [serverMode, setServerMode] = useState(false);
  const [tokenRequired, setTokenRequired] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const loadPackages = async () => {
    try {
      const res = await fetch("api/packages", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data?.packages) && data.packages.length) {
        setPkgs(data.packages as Pkg[]);
        setServerMode(true);
        setTokenRequired(Boolean(data?.capabilities?.tokenRequired));
      }
    } catch {
      // 以 file:// 或静态托管打开时没有接口，继续用内置数据
    }
  };

  useEffect(() => {
    void loadPackages();
  }, []);

  // SPK 工作室上传成功后通知列表刷新
  useEffect(() => {
    const refresh = () => void loadPackages();
    window.addEventListener("gpc:packages-updated", refresh);
    return () => window.removeEventListener("gpc:packages-updated", refresh);
  }, []);

  const removePackage = async (p: Pkg) => {
    if (!window.confirm(`从套件中心移除「${p.name}」？安装包文件也会一并删除。`)) return;
    try {
      const res = await fetch(`api/packages/${encodeURIComponent(p.file)}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setSelected(null);
        setNotice(`已移除 ${p.name}`);
        void loadPackages();
      } else {
        setNotice(data?.error || "移除失败");
      }
    } catch {
      setNotice("移除失败：无法连接服务");
    }
  };

  useEffect(
    () => setMaterial(normalize(defaults)),
    [],
  );
  useEffect(() => setLocalTheme(theme), [theme]);
  useEffect(() => {
    if (settingsOpen)
      root.current
        ?.querySelector<HTMLButtonElement>(".gw-material button")
        ?.focus();
  }, [settingsOpen]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const fmtBytes = (n: number) =>
    n >= 1024 * 1024
      ? `${(n / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(n / 1024))} KB`;

  const totalBytes = pkgs.reduce((s, p) => s + p.sizeBytes, 0);
  const archCounts = ARCHS.map((a) => ({
    arch: a,
    count: pkgs.filter((p) => p.arch.includes(a)).length,
  }));
  const catCounts = CATS.slice(1)
    .map((c) => ({ cat: c, count: pkgs.filter((p) => p.cat === c).length }))
    .filter((x) => x.count > 0);

  const visible = useMemo(
    () =>
      pkgs.filter((p) => {
        const hay = `${p.name} ${p.en} ${p.desc} ${p.cat} ${p.arch.join(" ")}`.toLowerCase();
        if (filter && !hay.includes(filter.toLowerCase())) return false;
        if (cat !== "全部" && p.cat !== cat) return false;
        if (arch !== "全部" && !p.arch.includes(arch)) return false;
        if (channel !== "全部" && p.ch !== channel) return false;
        return true;
      }),
    [filter, cat, arch, channel, pkgs],
  );

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const panels = content.current?.querySelectorAll(".gw-reveal");
        if (!panels?.length) return;
        gsap.fromTo(
          panels,
          { y: 12, opacity: 0.45, filter: "blur(3px)" },
          {
            y: 0,
            opacity: 1,
            filter: "blur(0px)",
            duration: 0.48,
            stagger: 0.045,
            ease: "power3.out",
            clearProps: "transform,opacity,filter",
          },
        );
      });
      return () => mm.revert();
    },
    { scope: root, dependencies: [view, cat, arch, channel], revertOnUpdate: true },
  );

  function updateGlass(patch: Partial<GlassSettings>) {
    const next = normalize({ ...material, ...patch });
    setMaterial(next);
  }
  function closeSettings() {
    setSettingsOpen(false);
    settingsTrigger.current?.focus();
  }
  function changeView(next: View) {
    setView(next);
    setAlerts(false);
    setSelected(null);
  }
  function toggleTheme() {
    const scheme = root.current
      ? getComputedStyle(root.current).colorScheme
      : "normal";
    const isDark =
      scheme === "dark" ||
      (scheme !== "light" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    setLocalTheme(isDark ? "light" : "dark");
  }
  function copySource() {
    const text = source.url;
    const done = () => setNotice("套件来源地址已复制");
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
  }
  function fallbackCopy(text: string, done: () => void) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); } catch { /* ignore */ }
    document.body.removeChild(ta);
  }
  function resetSource() {
    try {
      window.localStorage.removeItem(SOURCE_KEY);
    } catch {
      /* 隐私模式下可能禁用存储，忽略 */
    }
    const site = currentSiteUrl();
    setSource({
      url: site || SOURCE.url,
      note: site
        ? `已恢复为当前站点地址。若你的 SSPKS 源是另一个地址，请点「修改」直接填写。`
        : SOURCE.note,
      custom: false,
      origin: "default",
    });
    setNotice("已恢复为当前站点地址");
  }
  function applySourceEdit() {
    const next = normalizeSourceUrl(sourceDraft);
    if (!next) {
      setNotice("地址无效，请使用 http:// 或 https:// 开头的地址");
      return;
    }
    try {
      window.localStorage.setItem(SOURCE_KEY, next);
    } catch {
      /* 隐私模式下可能禁用存储，忽略 */
    }
    setSource({
      url: next,
      note: "当前地址已保存到本机浏览器，刷新后依然生效；DSM 套件中心需在 NAS 本机添加来源。",
      custom: true,
      origin: "saved",
    });
    setEditingSource(false);
    setNotice("套件来源地址已保存");
  }
  function download(p: Pkg) {
    const a = document.createElement("a");
    a.href = `packages/${p.file}`;
    a.download = p.file;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setNotice(`开始下载 ${p.name}`);
  }

  const nav = (compact = false) => (
    <nav
      className={compact ? "gw-rail gw-glass" : "gw-dock gw-glass"}
      aria-label={compact ? "快速导航" : "套件中心视图"}
    >
      {tabs.map((tab, i) => (
        <button
          key={tab.id}
          type="button"
          aria-label={compact ? tab.label : undefined}
          title={compact ? tab.label : undefined}
          aria-current={view === tab.id ? "page" : undefined}
          onClick={() => changeView(tab.id)}
          onKeyDown={(e) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
            e.preventDefault();
            const next =
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? tabs.length - 1
                  : (i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
            changeView(tabs[next].id);
            (e.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus();
          }}
        >
          <tab.icon size={18} strokeWidth={1.7} aria-hidden="true" />
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );

  const pkgCard = (p: Pkg) => (
    <article
      className="pc-card gw-panel gw-reveal"
      key={p.file}
      tabIndex={0}
      role="button"
      aria-label={`查看 ${p.name} 详情`}
      onClick={() => setSelected(p)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(p); }
      }}
    >
      <div className="pc-card-top">
        {p.icon ? (
          <img className="pc-icon" src={p.icon} alt="" />
        ) : (
          <span className="pc-icon pc-icon-fallback"><Package size={22} aria-hidden="true" /></span>
        )}
        <div className="pc-card-title">
          <strong>{p.name}</strong>
          <span>{displayPkgId(p)}</span>
        </div>
        <span className="pc-ver">版本 {p.v}</span>
      </div>
      <p className="pc-desc">{p.desc}</p>
      <div className="pc-tags">
        <span className="pc-tag">{p.cat}</span>
        {p.arch.map((a) => (
          <span className="pc-tag pc-tag-arch" key={a}><ArchIcon arch={a} />{a}</span>
        ))}
        <span className="pc-tag">DSM {p.dsm}+</span>
        {p.origin && p.origin !== "builtin" && <span className="pc-tag pc-tag-local">本地导入</span>}
      </div>
      <div className="pc-card-foot">
        <span className="pc-size"><HardDrive size={13} aria-hidden="true" />{p.size}</span>
        <span className="pc-channel">{p.ch === "stable" ? "稳定版" : "测试版"}</span>
        <button
          type="button"
          className="gw-button pc-dl"
          onClick={(e) => { e.stopPropagation(); download(p); }}
        >
          <Download size={13} aria-hidden="true" />下载安装包
        </button>
      </div>
    </article>
  );

  return (
    <div
      ref={root}
      className={`gw-root ${className}`}
      data-theme={useHostTheme ? "system" : localTheme}
      data-host-theme={useHostTheme}
      style={
        {
          "--gw-blur": `${material.blur}px`,
          "--gw-opacity": material.opacity,
          "--gw-saturation": material.saturation,
          "--gw-tint": useHostTheme
            ? `color-mix(in srgb, var(--color-background, Canvas) 80%, ${material.tint})`
            : material.tint,
          "--gw-edge": material.edge,
          ...style,
        } as CSSProperties
      }
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          if (settingsOpen) closeSettings();
          if (selected) setSelected(null);
          setAlerts(false);
        }
      }}
    >
      <style>{styles}</style>
      <style>{pcStyles}</style>
      {/* 背景由页面级 .gpc-backdrop 统一提供，这里不再叠加局部图片与遮罩 */}
      <div className="gw-workspace">
        <header className="gw-topbar gw-glass">
          <a
            className="gw-brand"
            href="#"
            onClick={(e) => { e.preventDefault(); changeView("browse"); }}
          >
            <span className="gw-brand-icon"><Layers size={18} strokeWidth={1.7} aria-hidden="true" /></span>
            <strong>{brand}</strong>
            <span className="gw-brand-divider" />
            <span className="gw-personal">群晖 DSM 7 · 自建套件源</span>
          </a>
          <div className="gw-toolbar">
            <button
              type="button"
              className="gw-adjust"
              onClick={() => {
                if (serverMode) {
                  setUploadOpen(true);
                  setAlerts(false);
                  setSettingsOpen(false);
                } else {
                  setNotice("当前是静态页面，上传需在容器中运行服务");
                }
              }}
            >
              <Upload size={16} aria-hidden="true" />
              <span>上传</span>
            </button>
            <button
              type="button"
              className="gw-adjust"
              ref={settingsTrigger}
              onClick={() => { setSettingsOpen(!settingsOpen); setAlerts(false); }}
              aria-expanded={settingsOpen}
              aria-controls={`${id}-material`}
            >
              <Settings2 size={16} aria-hidden="true" />
              <span>设置</span>
            </button>
            {!useHostTheme && (
              <button type="button" className="gw-icon-button" aria-label="切换明暗主题" onClick={toggleTheme}>
                <Sun className="gw-sun" size={17} aria-hidden="true" />
                <Moon className="gw-moon" size={17} aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              className="gw-icon-button gw-bell"
              aria-label="通知"
              aria-expanded={alerts}
              onClick={() => { setAlerts(!alerts); setSettingsOpen(false); }}
            >
              <Bell size={17} aria-hidden="true" />
              <i />
            </button>
            {userName && (
              <span className="gw-avatar" title={userName}>{userName.slice(0, 1).toUpperCase()}</span>
            )}
          </div>
        </header>

        <div className="gw-stage">
          {nav(true)}
          <main className="gw-main gw-glass">
            <div className="gw-view-heading">
              <div>
                <p className="gw-greeting">
                  {view === "browse"
                    ? "浏览可用套件，一键下载安装。"
                    : view === "studio"
                      ? "在浏览器里打包你自己的 DSM 7 套件。"
                      : view === "installed"
                        ? "当前套件源收录的全部套件。"
                        : view === "source"
                          ? "把此地址添加到 DSM 套件中心。"
                          : "关于这个套件中心演示。"}
                </p>
                <h1>
                  {view === "browse"
                    ? "套件中心"
                    : view === "studio"
                      ? "SPK 工作室"
                      : view === "installed"
                        ? "已收录套件"
                        : view === "source"
                          ? "套件来源"
                          : "关于"}
                </h1>
              </div>
              <div className="gw-heading-action">
                <span className="gw-date">
                  <CircleCheck size={14} aria-hidden="true" />
                  {pkgs.length} 个套件 · {fmtBytes(totalBytes)}
                </span>
              </div>
            </div>
            <div className="gw-mobile-nav">{nav()}</div>

            <div ref={content} key={view} className="gw-view">
              {view === "browse" && (
                <>
                  <div className="gw-overview-grid">
                    <section className="gw-panel gw-balance gw-reveal">
                      <div className="gw-panel-title">
                        <span>套件总数</span>
                        <Package size={17} aria-hidden="true" />
                      </div>
                      <strong className="gw-balance-value">{pkgs.length}</strong>
                      <p className="gw-balance-meta">
                        <span className="gw-positive gw-badge">{pkgs.filter((p) => p.ch === "stable").length} 稳定版</span>
                        {pkgs.filter((p) => p.ch !== "stable").length} 测试版
                      </p>
                      <div className="gw-account">
                        <span className="gw-account-icon"><HardDrive size={19} aria-hidden="true" /></span>
                        <div>
                          <strong>总大小</strong>
                          <span>{fmtBytes(totalBytes)}</span>
                        </div>
                        <button type="button" aria-label="查看已收录" onClick={() => changeView("installed")}>
                          <ArrowRight size={20} aria-hidden="true" />
                        </button>
                      </div>
                    </section>
                    <section className="gw-panel gw-cashflow gw-reveal">
                      <div className="gw-panel-title">
                        <h2>架构分布</h2>
                        <span>{ARCHS.length} 类架构</span>
                      </div>
                      <div className="pc-arch-bars">
                        {archCounts.map((a) => (
                          <div className="pc-arch-row" key={a.arch}>
                            <span className="pc-arch-name"><ArchIcon arch={a.arch} />{a.arch}</span>
                            <span className="gw-category-track pc-arch-track">
                              <i style={{ width: `${pkgs.length ? (a.count / pkgs.length) * 100 : 0}%` }} />
                            </span>
                            <strong>{a.count}</strong>
                          </div>
                        ))}
                      </div>
                      <div className="pc-arch-foot">
                        {catCounts.map((c) => (
                          <span className="pc-mini-tag" key={c.cat}>{c.cat} · {c.count}</span>
                        ))}
                      </div>
                    </section>
                  </div>

                  <div className="pc-section-head gw-reveal">
                    <div>
                      <h2>全部套件</h2>
                      <span>共 {visible.length} 个结果</span>
                    </div>
                    <button
                      type="button"
                      className="gw-button pc-up-open"
                      onClick={() => (serverMode ? setUploadOpen(true) : setNotice("当前是静态页面，上传需在容器中运行服务"))}
                    >
                      <Upload size={13} aria-hidden="true" />上传套件
                    </button>
                  </div>
                  <div className="pc-filters gw-reveal">
                    <label className="gw-search pc-search">
                      <Search size={15} aria-hidden="true" />
                      <input
                        aria-label="搜索套件"
                        placeholder="搜索名称、分类或架构…"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      />
                      {filter && (
                        <button type="button" aria-label="清除搜索" onClick={() => setFilter("")}>
                          <X size={14} aria-hidden="true" />
                        </button>
                      )}
                    </label>
                    <div className="gw-segment" role="group" aria-label="架构筛选">
                      {["全部", ...ARCHS].map((a) => (
                        <button key={a} type="button" aria-pressed={arch === a} onClick={() => setArch(a)}>{a}</button>
                      ))}
                    </div>
                  </div>
                  <div className="pc-grid">
                    {visible.length ? visible.map(pkgCard) : (
                      <div className="gw-empty pc-empty">
                        <Search size={23} aria-hidden="true" />
                        <h3>没有匹配的套件</h3>
                        <p>换个关键词或筛选条件试试。</p>
                        <button type="button" onClick={() => { setFilter(""); setCat("全部"); setArch("全部"); setChannel("全部"); }}>
                          清除筛选
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}

              {view === "studio" && <SpkStudio />}

              {view === "installed" && (
                <section className="gw-panel gw-reveal">
                  <div className="gw-panel-title">
                    <h2>已收录 <span className="gw-count">{pkgs.length}</span></h2>
                    <div className="gw-segment" role="group" aria-label="渠道筛选">
                      {["全部", "stable", "beta"].map((c) => (
                        <button key={c} type="button" aria-pressed={channel === c} onClick={() => setChannel(c)}>
                          {c === "全部" ? "全部" : c === "stable" ? "稳定" : "测试"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="pc-list">
                    {visible.length ? visible.map((p) => (
                      <div className="pc-list-row" key={p.file}>
                        {p.icon ? <img className="pc-icon-sm" src={p.icon} alt="" /> : <span className="pc-icon-sm pc-icon-fallback"><Package size={15} /></span>}
                        <div className="pc-list-name">
                          <strong>{p.name}</strong>
                          <span>{p.cat} · {p.dsm}+</span>
                        </div>
                        <span className="pc-tag pc-tag-arch">{p.arch.join(" · ")}</span>
                        {p.origin && p.origin !== "builtin" && <span className="pc-tag pc-tag-local">本地</span>}
                        <span className="pc-list-size">{p.size}</span>
                        <button type="button" className="gw-button" onClick={() => download(p)}>
                          <Download size={13} aria-hidden="true" />下载
                        </button>
                        <button type="button" className="gw-icon-button" aria-label={`查看 ${p.name} 详情`} onClick={() => setSelected(p)}>
                          <ChevronRight size={18} aria-hidden="true" />
                        </button>
                      </div>
                    )) : (
                      <div className="gw-empty">
                        <Boxes size={23} aria-hidden="true" />
                        <h3>该渠道暂无套件</h3>
                        <p>切换到「全部」查看所有套件。</p>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {view === "source" && (
                <>
                  <div className="gw-savings-intro gw-reveal">
                    <span className="gw-savings-orb"><Layers size={28} strokeWidth={1.3} aria-hidden="true" /></span>
                    <div className="pc-source-main">
                      <p>套件来源地址</p>
                      {editingSource ? (
                        <input
                          className="pc-source-input"
                          value={sourceDraft}
                          autoFocus
                          spellCheck={false}
                          aria-label="套件来源地址"
                          placeholder="https://your-nas.example.com/sspks/"
                          onChange={(e) => setSourceDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") applySourceEdit();
                            if (e.key === "Escape") setEditingSource(false);
                          }}
                        />
                      ) : (
                        <strong className="pc-source-strong">{source.url}</strong>
                      )}
                    </div>
                    <div className="pc-source-actions">
                      {editingSource ? (
                        <>
                          <button type="button" className="gw-button pc-copy" onClick={applySourceEdit}>
                            <Check size={14} aria-hidden="true" />保存
                          </button>
                          <button type="button" className="gw-button pc-copy" onClick={() => setEditingSource(false)}>
                            <X size={14} aria-hidden="true" />取消
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="gw-button pc-copy" onClick={copySource}>
                            <Copy size={14} aria-hidden="true" />复制
                          </button>
                          <button
                            type="button"
                            className="gw-button pc-copy"
                            onClick={() => { setSourceDraft(source.url); setEditingSource(true); }}
                          >
                            <Pencil size={14} aria-hidden="true" />修改
                          </button>
                          {source.custom && (
                            <button type="button" className="gw-button pc-copy" onClick={resetSource}>
                              <X size={14} aria-hidden="true" />重置
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <section className="gw-panel gw-reveal">
                    <div className="gw-panel-title">
                      <h2>在 DSM 中添加</h2>
                      <span>3 步完成</span>
                    </div>
                    <ol className="pc-steps">
                      <li><strong>打开套件中心</strong><span>DSM 桌面 → 套件中心 → 设置</span></li>
                      <li><strong>新增套件来源</strong><span>「套件来源」→「新增」，粘贴上面复制的地址</span></li>
                      <li><strong>安装套件</strong><span>确认后即可在列表中看到并安装本站套件</span></li>
                    </ol>
                  </section>
                  <section className="gw-savings-note gw-reveal pc-source-note">
                    <Info size={18} aria-hidden="true" />
                    <p>{source.note}</p>
                  </section>
                </>
              )}

              {view === "about" && (
                <>
                  <div className="gw-report-stats gw-reveal">
                    {[
                      { label: "套件总数", value: pkgs.length, icon: Package },
                      { label: "架构类型", value: ARCHS.length, icon: Cpu },
                      { label: "总大小", value: totalBytes, icon: HardDrive },
                    ].map((s, i) => (
                      <section className="gw-panel" key={s.label}>
                        <div className="gw-panel-title">
                          <span>{s.label}</span>
                          <s.icon size={17} aria-hidden="true" />
                        </div>
                        <strong>{i === 2 ? fmtBytes(s.value as number) : s.value}</strong>
                        <span>SSPKS-IMNKS 套件源</span>
                      </section>
                    ))}
                  </div>
                  <div className="gw-reports-grid">
                    <section className="gw-panel gw-reveal">
                      <div className="gw-panel-title">
                        <h2>架构分布</h2>
                        <span>按套件数</span>
                      </div>
                      <div className="pc-arch-bars pc-arch-bars-lg">
                        {archCounts.map((a) => (
                          <div className="pc-arch-row" key={a.arch}>
                            <span className="pc-arch-name"><ArchIcon arch={a.arch} />{a.arch}</span>
                            <span className="gw-category-track pc-arch-track">
                              <i style={{ width: `${pkgs.length ? (a.count / pkgs.length) * 100 : 0}%` }} />
                            </span>
                            <strong>{a.count}</strong>
                          </div>
                        ))}
                      </div>
                    </section>
                    <section className="gw-panel gw-reveal">
                      <div className="gw-panel-title">
                        <h2>关于此演示</h2>
                        <span>v2 · 玻璃版</span>
                      </div>
                      <p className="pc-about">
                        本页采用玻璃工作台的玻璃拟态设计语言重制，数据来自本地 SSPKS-IMNKS 套件源中的真实 SPK（{pkgs.length} 个）。
                        调整右上角的<strong>设置</strong>可实时改变玻璃材质。
                      </p>
                      <a
                        className="gw-button pc-about-link"
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink size={14} aria-hidden="true" />查看套件来源
                      </a>
                    </section>
                  </div>
                </>
              )}
            </div>

            <div className="gw-desktop-dock">{nav()}</div>
          </main>
        </div>

        {alerts && (
          <aside className="gw-notifications gw-glass" aria-label="通知">
            <div>
              <h2>一切正常</h2>
              <button type="button" aria-label="关闭通知" onClick={() => setAlerts(false)}>
                <X size={17} aria-hidden="true" />
              </button>
            </div>
            <p>已收录 {pkgs.length} 个套件，无新通知。</p>
          </aside>
        )}

        {settingsOpen && (
          <aside className="gw-material gw-glass" id={`${id}-material`} aria-label="玻璃外观">
            <div className="gw-material-title">
              <div>
                <span className="gw-material-icon"><Settings2 size={18} aria-hidden="true" /></span>
                <h2>玻璃外观</h2>
              </div>
              <button type="button" className="gw-icon-button" aria-label="关闭玻璃设置" onClick={closeSettings}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <p>调整整个工作区中的玻璃材质。</p>
            <div className="gw-material-sample" aria-hidden="true">
              <Layers size={28} strokeWidth={1.1} />
              <span>实时材质预览</span>
            </div>
            <div className="gw-presets" aria-label="玻璃预设">
              {[
                { name: "清透", value: { blur: 8, opacity: 0.12, saturation: 1.1, edge: 0.8 } },
                { name: "磨砂", value: defaults },
                { name: "实心", value: { blur: 32, opacity: 0.86, saturation: 1, edge: 0.35 } },
              ].map((p) => (
                <button key={p.name} type="button" onClick={() => updateGlass(p.value)}>{p.name}</button>
              ))}
            </div>
            {[
              { key: "blur", label: "模糊", min: 0, max: 40, step: 1, value: `${Math.round(material.blur)} 像素` },
              { key: "opacity", label: "不透明度", min: 0.08, max: 0.9, step: 0.01, value: `${Math.round(material.opacity * 100)}%` },
              { key: "saturation", label: "饱和度", min: 0.5, max: 2, step: 0.05, value: `${Math.round(material.saturation * 100)}%` },
              { key: "edge", label: "边缘光", min: 0, max: 1, step: 0.05, value: `${Math.round(material.edge * 100)}%` },
            ].map((c) => (
              <label className="gw-range" key={c.key}>
                <span>{c.label}<output>{c.value}</output></span>
                <input
                  type="range"
                  aria-label={c.label}
                  min={c.min}
                  max={c.max}
                  step={c.step}
                  value={material[c.key as keyof GlassSettings]}
                  onChange={(e) => updateGlass({ [c.key]: Number(e.target.value) })}
                />
              </label>
            ))}
            <label className="gw-tint">
              玻璃色调{" "}
              <input type="color" value={material.tint} onChange={(e) => updateGlass({ tint: e.target.value })} />
            </label>
            <button className="gw-reset" type="button" onClick={() => updateGlass(normalize(defaults))}>
              重置外观
            </button>
          </aside>
        )}
      </div>

      {selected && (
        <div className="pc-modal-mask" onClick={() => setSelected(null)}>
          <aside className="pc-modal gw-glass" onClick={(e) => e.stopPropagation()} aria-label={`${selected.name} 详情`}>
            <div className="pc-modal-head">
              {selected.icon ? <img className="pc-icon-lg" src={selected.icon} alt="" /> : <span className="pc-icon-lg pc-icon-fallback"><Package size={30} /></span>}
              <button type="button" className="gw-icon-button" aria-label="关闭详情" onClick={() => setSelected(null)}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <h2>{selected.name}</h2>
            <span className="pc-modal-en">{displayPkgId(selected)}</span>
            <span className="gw-mver">版本 {selected.v} · DSM {selected.dsm}+</span>
            <p className="gw-mdesc">{selected.long}</p>
            <div className="mtitle">详细信息</div>
            <dl className="kv">
              <dt>分类</dt><dd>{selected.cat}</dd>
              <dt>版本</dt><dd>{selected.v}</dd>
              <dt>支持架构</dt><dd>{selected.arch.join(" · ")}</dd>
              <dt>最低 DSM</dt><dd>DSM {selected.dsm}+</dd>
              <dt>渠道</dt><dd>{selected.ch === "stable" ? "稳定版" : "测试版"}</dd>
              <dt>体积</dt><dd>{selected.size}</dd>
              <dt>来源</dt>
              <dd>
                {selected.origin === "upload"
                  ? "本地上传"
                  : selected.origin === "scan"
                    ? "目录自动扫描"
                    : "本地构建 · SSPKS-IMNKS"}
              </dd>
            </dl>
            <div className="mtitle">支持架构</div>
            <div className="march">
              {selected.arch.map((a) => (
                <span className="tag arch pc-tag-arch" key={a}><ArchIcon arch={a} />{a}</span>
              ))}
            </div>
            <button className="btn" type="button" onClick={() => download(selected)}>
              <ArrowDownToLine size={17} aria-hidden="true" />下载安装包（{selected.size}）
            </button>
            {serverMode && selected.origin && selected.origin !== "builtin" && (
              <button className="gw-button pc-remove" type="button" onClick={() => void removePackage(selected)}>
                <Trash2 size={14} aria-hidden="true" />从套件中心移除
              </button>
            )}
          </aside>
        </div>
      )}

      <PackageUpload
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        tokenRequired={tokenRequired}
        onUploaded={(message) => {
          setNotice(message);
          void loadPackages();
        }}
      />

      {notice && (
        <div className="gw-toast" role="status">
          <Check size={16} aria-hidden="true" />
          {notice}
        </div>
      )}
    </div>
  );
}

const pcStyles = `
.pc-card{cursor:pointer;display:flex;flex-direction:column;gap:12px;transition:transform .18s ease,box-shadow .18s ease}
.pc-card:hover,.pc-card:focus-visible{transform:translateY(-3px)}
.pc-card-top{display:flex;align-items:center;gap:11px}
.pc-icon{width:46px;height:46px;border-radius:11px;object-fit:cover;flex:none;background:rgba(127,127,127,.12)}
.pc-icon-sm{width:32px;height:32px;border-radius:8px;object-fit:cover;flex:none;background:rgba(127,127,127,.12)}
.pc-icon-lg{width:72px;height:72px;border-radius:16px;object-fit:cover;flex:none}
.pc-icon-fallback{display:grid;place-items:center;color:var(--gw-accent)}
.pc-card-title{display:flex;flex-direction:column;min-width:0;flex:1}
.pc-card-title strong{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pc-card-title span{font-size:10px;color:var(--gw-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pc-ver{font-size:10px;color:var(--gw-muted);background:var(--gw-segment);padding:3px 7px;border-radius:6px;white-space:nowrap;flex:none}
.pc-desc{font-size:11.5px;color:var(--gw-muted);line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:36px}
.pc-tags{display:flex;gap:6px;flex-wrap:wrap}
.pc-tag{display:inline-flex;align-items:center;gap:4px;font-size:10px;padding:3px 8px;border-radius:6px;background:var(--gw-goal-surface);color:var(--gw-muted)}
.pc-tag-arch{color:var(--gw-accent);background:var(--gw-income-surface)}
.pc-card-foot{display:flex;align-items:center;gap:8px;border-top:1px solid var(--gw-line);padding-top:11px;margin-top:auto}
.pc-size{display:inline-flex;align-items:center;gap:4px;font-size:10px;color:var(--gw-muted)}
.pc-channel{font-size:10px;color:var(--gw-muted)}
.pc-dl{margin-left:auto;padding:6px 10px;font-size:10px !important;border-radius:7px}
.pc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}
.pc-empty{grid-column:1/-1}
.pc-section-head{display:flex;align-items:center;justify-content:space-between;margin:4px 0 14px}
.pc-section-head h2,.pc-section-head div{font-size:14px;font-weight:600}
.pc-section-head span{font-size:11px;color:var(--gw-muted)}
.pc-filters{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:16px}
.pc-search{flex:1;min-width:210px}
.pc-search input{width:100%;min-width:0}
.pc-arch-bars{display:flex;flex-direction:column;gap:15px;padding:6px 0 4px}
.pc-arch-row{display:flex;align-items:center;gap:12px;font-size:11px}
.pc-arch-name{display:inline-flex;align-items:center;gap:6px;width:88px;flex:none}
.pc-arch-track{flex:1;height:6px;margin:0}
.pc-arch-row strong{font-size:12px;font-weight:600;width:20px;text-align:right}
.pc-arch-bars-lg{gap:22px;padding:10px 0}
.pc-arch-foot{display:flex;gap:7px;flex-wrap:wrap;margin-top:22px}
.pc-mini-tag{font-size:10px;color:var(--gw-muted);background:var(--gw-goal-surface);padding:4px 9px;border-radius:6px}
.pc-list{display:flex;flex-direction:column}
.pc-list-row{display:flex;align-items:center;gap:11px;padding:12px 0;border-top:1px solid var(--gw-line)}
.pc-list-row:first-child{border-top:0;padding-top:0}
.pc-list-name{display:flex;flex-direction:column;flex:1;min-width:0}
.pc-list-name strong{font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pc-list-name span{font-size:10px;color:var(--gw-muted)}
.pc-list-size{font-size:10px;color:var(--gw-muted);white-space:nowrap}
.pc-list-row .gw-button{padding:7px 11px;font-size:10px !important;border-radius:7px}
.pc-source-main{min-width:0;flex:1}
.pc-source-strong{font-size:clamp(15px,1.8vw,22px) !important;font-weight:500 !important;letter-spacing:-0.02em !important;word-break:break-all}
.pc-source-input{width:100%;font-size:clamp(13px,1.5vw,17px) !important;padding:8px 10px;border:1px solid var(--gw-accent) !important;border-radius:8px !important;background:var(--gw-panel) !important;color:var(--gw-text) !important}
.pc-copy{white-space:nowrap}
.pc-source-actions{display:flex;gap:8px;flex:none;flex-wrap:wrap}
.pc-steps{list-style:none;counter-reset:step;display:flex;flex-direction:column;gap:16px}
.pc-steps li{counter-increment:step;display:flex;flex-direction:column;gap:3px;padding-left:42px;position:relative}
.pc-steps li:before{content:counter(step);position:absolute;left:0;top:0;width:28px;height:28px;border-radius:50%;background:var(--gw-income-surface);color:var(--gw-accent);display:grid;place-items:center;font-size:12px;font-weight:600}
.pc-steps strong{font-size:12px;font-weight:600}
.pc-steps span{font-size:11px;color:var(--gw-muted)}
.pc-source-note{align-items:flex-start}
.pc-source-note svg{flex:none;color:var(--gw-accent)}
.pc-about{font-size:12px;line-height:1.75;color:var(--gw-muted)}
.pc-about strong{color:var(--gw-ink)}
.pc-about-link{margin-top:18px;text-decoration:none}
.gw-badge{padding:3px 6px;border-radius:5px}
.pc-modal-mask{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.42);backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:48px 16px}
.pc-modal{border-radius:22px;width:min(560px,100%);padding:26px;background:var(--gw-popover)}
.pc-modal-head{display:flex;align-items:flex-start;justify-content:space-between}
.pc-modal h2{font-size:22px;font-weight:600;letter-spacing:-0.03em;margin-top:14px}
.pc-modal-en{font-size:12px;color:var(--gw-muted)}
.pc-modal .gw-mver{display:inline-block;margin-top:12px;font-size:11px;color:var(--gw-accent);background:var(--gw-income-surface);padding:4px 10px;border-radius:7px}
.pc-modal .gw-mdesc{margin-top:16px;color:var(--gw-muted);font-size:12.5px;line-height:1.7}
@media (max-width:700px){
  .pc-search{min-width:100%}
  .pc-list-size{display:none}
  .pc-source-strong{font-size:15px !important}
}
.pc-up-open{padding:7px 12px;font-size:11px !important;border-radius:8px;white-space:nowrap}
.pc-tag-local{color:var(--gw-accent);background:var(--gw-income-surface);font-weight:600}
.pc-remove{margin-top:10px;width:100%;justify-content:center;color:#d9534f;border-color:rgba(217,83,79,.35) !important}
.pc-up{width:min(520px,100%);border-radius:22px;padding:24px;background:var(--gw-popover);border:1px solid var(--gw-line)}
.pc-up-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:16px}
.pc-up-head h2{font-size:18px;font-weight:600;letter-spacing:-0.02em}
.pc-up-head p{font-size:11.5px;color:var(--gw-muted);line-height:1.6;margin-top:5px}
.pc-up-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;text-align:center;padding:30px 18px;border-radius:16px;border:1.5px dashed var(--gw-line);background:var(--gw-goal-surface);cursor:pointer;transition:border-color .18s ease,background .18s ease,transform .18s ease}
.pc-up-drop:hover{border-color:var(--gw-accent);transform:translateY(-1px)}
.pc-up-drop.is-drag{border-color:var(--gw-accent);border-style:solid;background:var(--gw-income-surface)}
.pc-up-drop.has-file{border-style:solid;border-color:var(--gw-accent)}
.pc-up-drop strong{font-size:12.5px;font-weight:600;word-break:break-all}
.pc-up-drop span{font-size:11px;color:var(--gw-muted)}
.pc-up-icon{display:grid;place-items:center;width:46px;height:46px;border-radius:13px;background:var(--gw-income-surface);color:var(--gw-accent);margin-bottom:2px}
.pc-up-token{display:flex;flex-direction:column;gap:6px;margin-top:14px;font-size:11px;color:var(--gw-muted)}
.pc-up-token input{padding:8px 10px;border-radius:8px;border:1px solid var(--gw-line);background:var(--gw-panel);color:var(--gw-text);font-size:12px}
.pc-up-progress{position:relative;height:22px;border-radius:7px;background:var(--gw-goal-surface);overflow:hidden;margin-top:14px}
.pc-up-progress span{position:absolute;inset:0 auto 0 0;background:var(--gw-accent);opacity:.35;transition:width .2s ease}
.pc-up-progress em{position:absolute;inset:0;display:grid;place-items:center;font-size:10.5px;font-style:normal;color:var(--gw-text);font-weight:600}
.pc-up-msg{display:flex;align-items:center;gap:8px;margin-top:14px;padding:10px 12px;border-radius:10px;font-size:11.5px;line-height:1.5}
.pc-up-msg svg{flex:none}
.pc-up-msg.is-error{background:rgba(217,83,79,.1);color:#d9534f}
.pc-up-msg.is-done{background:var(--gw-income-surface);color:var(--gw-text);align-items:flex-start}
.pc-up-msg.is-done div{display:flex;flex-direction:column;gap:2px}
.pc-up-msg.is-done span{font-size:10.5px;color:var(--gw-muted)}
.pc-up-foot{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}
.pc-up-send{background:var(--gw-accent) !important;color:#fff !important;border-color:transparent !important}
.pc-up-send:disabled{opacity:.5;cursor:not-allowed}
.pc-spin{animation:pc-spin .9s linear infinite}
@keyframes pc-spin{to{transform:rotate(360deg)}}
`;
