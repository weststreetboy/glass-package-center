"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  Check,
  Download,
  FileArchive,
  FolderOpen,
  Hammer,
  Image as ImageIcon,
  Trash2,
} from "lucide-react";
import {
  buildSpk,
  iconFromImage,
  makeInfo,
  placeholderIcon,
  readPayloadFiles,
  type StudioConfig,
  type StudioFile,
  type StudioIcons,
} from "./spkBuilder";

type Built = ReturnType<typeof buildSpk>;
type HistoryItem = { name: string; time: string; size: number };

const HISTORY_KEY = "wb_gpc_spk_history";

const initial: StudioConfig = {
  name: "MyPackage",
  displayname: "我的套件",
  version: "1.0.0-0001",
  arch: "noarch",
  archList: "",
  osMinVer: "7.0-40000",
  maintainer: "homebrew",
  distributor: "SSPKS",
  supportUrl: "",
  description: "在浏览器里打包的 DSM 7 演示套件。",
  startable: false,
  adminPort: "",
  adminProtocol: "http",
  licenseText: "MIT License. Demo package only.\n",
  forceExec: true,
};

const fmt = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1048576).toFixed(2)} MB`
    : `${(n / 1024).toFixed(1)} KB`;

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="sp-field">
      <span className="sp-label">{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export default function SpkStudio() {
  const [cfg, setCfg] = useState<StudioConfig>(initial);
  const [files, setFiles] = useState<StudioFile[]>([]);
  const [icons, setIcons] = useState<StudioIcons | null>(null);
  const [iconUrl, setIconUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Built | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]") as HistoryItem[];
    } catch {
      return [];
    }
  });
  const dirInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => () => { if (iconUrl) URL.revokeObjectURL(iconUrl); }, [iconUrl]);

  const set = <K extends keyof StudioConfig>(key: K, value: StudioConfig[K]) =>
    setCfg((prev) => ({ ...prev, [key]: value }));

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const incoming = await readPayloadFiles(Array.from(list));
    setFiles((prev) => {
      const map = new Map(prev.map((f) => [f.path, f]));
      incoming.forEach((f) => map.set(f.path, f));
      return Array.from(map.values()).sort((a, b) => a.path.localeCompare(b.path));
    });
    if (dirInput.current) dirInput.current.value = "";
  }

  async function addIcon(file?: File) {
    if (!file) return;
    try {
      const made = await iconFromImage(file);
      setIcons(made);
      if (iconUrl) URL.revokeObjectURL(iconUrl);
      setIconUrl(URL.createObjectURL(file));
    } catch (e) {
      setError(`图标读取失败：${String(e)}`);
    }
  }

  async function build() {
    setError("");
    setResult(null);
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(cfg.name)) {
      setError("包名只能用字母、数字、下划线、点和连字符，且以字母或数字开头。");
      return;
    }
    if (!cfg.version.trim()) {
      setError("请填写版本号。");
      return;
    }
    if (!files.length) {
      setError("请至少选择一个打包文件。");
      return;
    }
    setBusy(true);
    try {
      const ic = icons ?? {
        i64: placeholderIcon(64),
        i256: placeholderIcon(256),
      };
      const res = buildSpk(cfg, files, ic);
      if (url) URL.revokeObjectURL(url);
      setUrl(URL.createObjectURL(res.blob));
      setResult(res);
      const next = [
        { name: res.filename, time: new Date().toLocaleString("zh-CN"), size: res.spkBytes },
        ...history,
      ].slice(0, 6);
      setHistory(next);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const infoPreview = makeInfo(cfg, result?.checksum || "构建时计算");

  return (
    <div className="sp-wrap">
      <style>{css}</style>
      <div className="sp-grid">
        <section className="sp-panel">
          <div className="sp-title">
            <span className="sp-icon"><Hammer size={19} strokeWidth={1.6} /></span>
            <div>
              <h2>套件配置</h2>
              <p>填写元数据，选择文件，一键生成 .spk</p>
            </div>
          </div>

          <div className="sp-section">
            <h3>1 · 套件身份</h3>
            <div className="sp-fields">
              <Field label="包名" hint="只允许字母、数字、_ . -">
                <input value={cfg.name} onChange={(e) => set("name", e.target.value)} />
              </Field>
              <Field label="显示名称">
                <input value={cfg.displayname} onChange={(e) => set("displayname", e.target.value)} />
              </Field>
              <Field label="版本">
                <input value={cfg.version} onChange={(e) => set("version", e.target.value)} />
              </Field>
              <Field label="架构">
                <select value={cfg.arch} onChange={(e) => set("arch", e.target.value)}>
                  <option value="noarch">noarch（通用）</option>
                  <option value="x86_64">x86_64（Intel）</option>
                  <option value="armv8">armv8（ARM）</option>
                </select>
              </Field>
              <Field label="最低 DSM" hint="例如 7.0-40000">
                <input value={cfg.osMinVer} onChange={(e) => set("osMinVer", e.target.value)} />
              </Field>
              <Field label="平台列表" hint="留空则用上面的架构">
                <input value={cfg.archList} onChange={(e) => set("archList", e.target.value)} placeholder="apollolake avoton …" />
              </Field>
            </div>
          </div>

          <div className="sp-section">
            <h3>2 · 描述与支持</h3>
            <div className="sp-fields">
              <Field label="维护者">
                <input value={cfg.maintainer} onChange={(e) => set("maintainer", e.target.value)} />
              </Field>
              <Field label="发行者">
                <input value={cfg.distributor} onChange={(e) => set("distributor", e.target.value)} />
              </Field>
              <Field label="支持网址">
                <input value={cfg.supportUrl} onChange={(e) => set("supportUrl", e.target.value)} placeholder="https://…" />
              </Field>
              <label className="sp-check sp-inline-check">
                <input type="checkbox" checked={cfg.startable} onChange={(e) => set("startable", e.target.checked)} />
                后台服务（startable）
              </label>
              <Field label="管理端口" hint="填写后套件中心显示「打开」按钮">
                <input value={cfg.adminPort} onChange={(e) => set("adminPort", e.target.value)} placeholder="留空则不显示" />
              </Field>
              <Field label="协议">
                <select value={cfg.adminProtocol} onChange={(e) => set("adminProtocol", e.target.value)}>
                  <option value="http">http</option>
                  <option value="https">https</option>
                </select>
              </Field>
            </div>
            <Field label="套件描述">
              <textarea rows={2} value={cfg.description} onChange={(e) => set("description", e.target.value)} />
            </Field>
          </div>

          <div className="sp-section">
            <h3>3 · 打包内容</h3>
            <div className="sp-drop">
              <input
                type="file"
                multiple
                onChange={(e) => addFiles(e.target.files)}
              />
              <button
                type="button"
                className="sp-mini"
                onClick={() => dirInput.current?.click()}
              >
                <FolderOpen size={13} />选择整个文件夹
              </button>
              <input
                ref={dirInput}
                type="file"
                multiple
                className="sp-hidden"
                onChange={(e) => addFiles(e.target.files)}
                {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
              />
              <span>或直接多选文件 · 共 {files.length} 个</span>
            </div>
            {files.length > 0 && (
              <div className="sp-filelist">
                {files.slice(0, 8).map((f) => (
                  <div key={f.path} className="sp-filerow">
                    <FileArchive size={12} />
                    <span title={f.path}>{f.path}</span>
                    <small>{fmt(f.size)}</small>
                    <button
                      type="button"
                      aria-label={`移除 ${f.path}`}
                      onClick={() => setFiles((prev) => prev.filter((x) => x.path !== f.path))}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                {files.length > 8 && <small className="sp-more">还有 {files.length - 8} 个文件…</small>}
              </div>
            )}
            <label className="sp-check">
              <input type="checkbox" checked={cfg.forceExec} onChange={(e) => set("forceExec", e.target.checked)} />
              .sh 与 scripts/ 下的文件设为可执行（0755）
            </label>
          </div>

          <div className="sp-section sp-2col">
            <div>
              <h3>4 · 图标与许可</h3>
              <div className="sp-iconrow">
                <label className="sp-mini">
                  <ImageIcon size={13} />上传图标
                  <input type="file" accept="image/*" className="sp-hidden" onChange={(e) => addIcon(e.target.files?.[0])} />
                </label>
                <span className="sp-thumb">
                  {iconUrl ? <img src={iconUrl} alt="图标预览" /> : <Hammer size={17} />}
                </span>
                <small>自动生成 64 / 256 PNG</small>
              </div>
              <Field label="许可协议">
                <textarea rows={2} value={cfg.licenseText} onChange={(e) => set("licenseText", e.target.value)} />
              </Field>
            </div>
          </div>
        </section>

        <aside className="sp-side">
          <section className="sp-panel">
            <div className="sp-title">
              <span className="sp-icon"><FileArchive size={19} strokeWidth={1.6} /></span>
              <div>
                <h2>INFO 预览</h2>
                <p>写入 spk 根目录的元数据</p>
              </div>
            </div>
            <pre className="sp-info">{infoPreview}</pre>
          </section>

          <section className="sp-panel sp-build">
            <button type="button" className="sp-primary" disabled={busy} onClick={build}>
              {busy ? "正在打包…" : "开始构建 .spk"}
            </button>
            {error && (
              <div className="sp-error"><AlertCircle size={14} />{error}</div>
            )}
            {result && (
              <div className="sp-done">
                <div className="sp-okline"><Check size={15} />构建完成</div>
                <dl>
                  <div><dt>文件名</dt><dd>{result.filename}</dd></div>
                  <div><dt>MD5</dt><dd className="sp-mono">{result.checksum}</dd></div>
                  <div><dt>大小</dt><dd>{fmt(result.spkBytes)}（package.tgz {fmt(result.tgzBytes)}）</dd></div>
                </dl>
                <a className="sp-primary sp-download" href={url} download={result.filename}>
                  <Download size={15} />下载 .spk
                </a>
              </div>
            )}
            <p className="sp-note">
              全部在浏览器本地完成，文件不会上传。产物结构与 SPK Studio 的 Python 版一致。
            </p>
          </section>

          {history.length > 0 && (
            <section className="sp-panel">
              <div className="sp-title"><div><h2>本机构建记录</h2><p>仅保存在此浏览器</p></div></div>
              <div className="sp-history">
                {history.map((h, i) => (
                  <div key={`${h.name}-${i}`}>
                    <span title={h.name}>{h.name}</span>
                    <small>{fmt(h.size)} · {h.time}</small>
                  </div>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

const css = `
.sp-wrap{color:var(--gw-ink,#1d1d1f)}
.sp-grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(300px,.9fr);gap:16px;align-items:start}
.sp-panel{background:var(--gw-panel,rgba(255,255,255,.55));border:1px solid var(--gw-line,rgba(0,0,0,.08));border-radius:22px;padding:20px;backdrop-filter:blur(18px)}
.sp-title{display:flex;gap:12px;align-items:center;margin-bottom:18px}
.sp-title h2{font-size:17px;font-weight:600;letter-spacing:-.02em}
.sp-title p{font-size:11px;opacity:.62;margin-top:2px}
.sp-icon{width:36px;height:36px;border-radius:12px;display:grid;place-items:center;background:var(--gw-accent-soft,rgba(0,102,204,.1));color:var(--gw-accent,#0066cc);flex:none}
.sp-section{padding:14px 0;border-top:1px solid var(--gw-line,rgba(0,0,0,.08))}
.sp-section h3{font-size:12px;font-weight:600;margin-bottom:11px;opacity:.8}
.sp-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.sp-field{display:flex;flex-direction:column;gap:4px;min-width:0;margin-bottom:9px}
.sp-label,.sp-section h3{font-size:11px;font-weight:600;opacity:.75}
.sp-field small{font-size:10px;opacity:.5}
.sp-field input,.sp-field select,.sp-field textarea{width:100%;box-sizing:border-box;border:1px solid var(--gw-line,rgba(0,0,0,.1));border-radius:9px;background:var(--gw-field,rgba(255,255,255,.65));color:inherit;padding:8px 10px;font-size:12px;font-family:inherit;outline:none}
.sp-field input:focus,.sp-field select:focus,.sp-field textarea:focus{border-color:var(--gw-accent,#0066cc)}
.sp-field textarea{resize:vertical;min-height:44px}
.sp-check{display:flex;align-items:center;gap:7px;font-size:11px;opacity:.8;margin:8px 0}
.sp-inline-check{padding-top:18px}
.sp-drop{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:11px;border:1px dashed var(--gw-line,rgba(0,0,0,.18));border-radius:11px;font-size:11px;opacity:.85}
.sp-mini{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--gw-line,rgba(0,0,0,.1));border-radius:8px;padding:6px 10px;font-size:11px;color:inherit;background:var(--gw-field,rgba(255,255,255,.65));cursor:pointer}
.sp-hidden{display:none!important}
.sp-filelist{margin:9px 0;max-height:150px;overflow:auto;display:flex;flex-direction:column;gap:4px}
.sp-filerow{display:flex;align-items:center;gap:7px;font-size:11px;padding:4px 6px;border-radius:7px;background:rgba(127,127,127,.07)}
.sp-filerow span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sp-filerow small{opacity:.55}
.sp-filerow button{border:0;background:transparent;color:inherit;cursor:pointer;opacity:.55;padding:2px}
.sp-more{font-size:10px;opacity:.5;padding-left:6px}
.sp-iconrow{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.sp-thumb{width:36px;height:36px;border-radius:9px;border:1px solid var(--gw-line,rgba(0,0,0,.1));display:grid;place-items:center;overflow:hidden;background:rgba(127,127,127,.07)}
.sp-thumb img{width:100%;height:100%;object-fit:contain}
.sp-iconrow small{font-size:10px;opacity:.55}
.sp-info{font:10.5px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-all;max-height:280px;overflow:auto;margin:0;padding:12px;border-radius:12px;background:rgba(127,127,127,.09);color:inherit}
.sp-build{display:flex;flex-direction:column;gap:10px}
.sp-primary{display:inline-flex;align-items:center;justify-content:center;gap:7px;width:100%;padding:11px 14px;border:0;border-radius:11px;background:var(--gw-accent,#0066cc);color:#fff;font-size:12px;font-weight:600;cursor:pointer;text-decoration:none}
.sp-primary:disabled{opacity:.55;cursor:default}
.sp-download{background:rgba(0,102,204,.13);color:var(--gw-accent,#0066cc)}
.sp-error,.sp-okline{display:flex;align-items:center;gap:7px;font-size:11px;padding:9px 10px;border-radius:9px}
.sp-error{background:rgba(220,60,60,.1);color:#c62f2f}
.sp-okline{background:rgba(40,160,90,.12);color:#18814a}
.sp-done dl{margin:0;display:flex;flex-direction:column;gap:5px}
.sp-done dl div{display:flex;gap:10px;font-size:11px}
.sp-done dt{opacity:.55;min-width:44px}
.sp-done dd{margin:0;word-break:break-all}
.sp-mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10px}
.sp-note{font-size:10px;line-height:1.6;opacity:.5;margin:0}
.sp-history{display:flex;flex-direction:column;gap:7px;max-height:160px;overflow:auto}
.sp-history div{display:flex;flex-direction:column;gap:1px;padding:7px 9px;border-radius:9px;background:rgba(127,127,127,.07)}
.sp-history span{font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sp-history small{font-size:10px;opacity:.55}
@media(max-width:900px){.sp-grid{grid-template-columns:1fr}.sp-fields{grid-template-columns:1fr 1fr}}
@media(max-width:520px){.sp-fields{grid-template-columns:1fr}.sp-panel{padding:15px;border-radius:18px}}
`;
