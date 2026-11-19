"use client";

import { useRef, useState, type DragEvent } from "react";
import {
  AlertCircle,
  Check,
  FileArchive,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";

const CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_BYTES = 2 * 1024 * 1024 * 1024;

type UploadedPkg = { name?: string; v?: string; arch?: string[]; size?: string; origin?: string };
type ChunkResult = { ok: boolean; error?: string };
type FinishResult = ChunkResult & { status: number; package?: UploadedPkg };

type Props = {
  open: boolean;
  onClose: () => void;
  onUploaded: (message: string) => void;
  tokenRequired?: boolean;
};

export default function PackageUpload({ open, onClose, onUploaded, tokenRequired }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<UploadedPkg | null>(null);
  const [token, setToken] = useState(() => {
    try {
      return window.localStorage.getItem("gpc_token") || "";
    } catch {
      return "";
    }
  });

  if (!open) return null;

  const reset = () => {
    setFile(null);
    setProgress(0);
    setError("");
    setDone(null);
    setBusy(false);
  };

  const pick = (f: File | null) => {
    setError("");
    setDone(null);
    setProgress(0);
    if (!f) {
      setFile(null);
      return;
    }
    if (!f.name.toLowerCase().endsWith(".spk")) {
      setFile(null);
      setError("只支持 .spk 套件文件");
      return;
    }
    if (f.size > MAX_BYTES) {
      setFile(null);
      setError(`文件 ${(f.size / 1024 / 1024 / 1024).toFixed(2)} GB 超过单包 2 GB 上限`);
      return;
    }
    setFile(f);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDrag(false);
    pick(e.dataTransfer.files?.[0] ?? null);
  };

  const send = async () => {
    if (!file || busy) return;
    const current = file;
    setBusy(true);
    setError("");
    setProgress(0);

    const base = new URLSearchParams({ name: current.name });
    if (token) base.set("token", token);
    const uploadId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const total = Math.max(1, Math.ceil(current.size / CHUNK_BYTES));

    const postChunk = (index: number, blob: Blob) =>
      new Promise<ChunkResult>((resolve) => {
        const q = new URLSearchParams(base);
        q.set("id", uploadId);
        q.set("index", String(index));
        q.set("total", String(total));
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `api/upload/chunk?${q.toString()}`);
        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return;
          const pct = ((index + e.loaded / e.total) / total) * 100;
          setProgress(Math.min(99, Math.round(pct)));
        };
        xhr.onload = () => {
          let data: ChunkResult | null = null;
          try {
            data = JSON.parse(xhr.responseText);
          } catch {
            data = null;
          }
          resolve(
            xhr.status >= 200 && xhr.status < 300 && data?.ok
              ? { ok: true }
              : { ok: false, error: data?.error || `HTTP ${xhr.status}` },
          );
        };
        xhr.onerror = () => resolve({ ok: false, error: "网络连接中断" });
        xhr.ontimeout = () => resolve({ ok: false, error: "请求超时" });
        xhr.send(blob);
      });

    try {
      for (let i = 0; i < total; i++) {
        const start = i * CHUNK_BYTES;
        const end = Math.min(start + CHUNK_BYTES, current.size);
        let lastError = "";
        let uploaded = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          const result = await postChunk(i, current.slice(start, end));
          if (result.ok) {
            uploaded = true;
            break;
          }
          lastError = result.error || "上传失败";
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
          }
        }
        if (!uploaded) {
          throw new Error(`第 ${i + 1}/${total} 片上传失败：${lastError}`);
        }
        setProgress(Math.round(((i + 1) / total) * 100));
      }

      const q = new URLSearchParams(base);
      q.set("id", uploadId);
      q.set("total", String(total));
      const finish = await new Promise<FinishResult>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `api/upload/finish?${q.toString()}`);
        xhr.onload = () => {
          let data: FinishResult | null = null;
          try {
            data = JSON.parse(xhr.responseText);
          } catch {
            data = null;
          }
          resolve({
            ok: xhr.status >= 200 && xhr.status < 300 && Boolean(data?.ok),
            status: xhr.status,
            error: data?.error,
            package: data?.package,
          });
        };
        xhr.onerror = () => resolve({ ok: false, status: 0, error: "网络连接中断" });
        xhr.send();
      });
      if (!finish.ok) {
        throw new Error(finish.error || `合并失败（HTTP ${finish.status}）`);
      }

      try {
        if (token) window.localStorage.setItem("gpc_token", token);
      } catch {
        /* 隐私模式下写入会失败，忽略 */
      }
      setDone(finish.package ?? { name: current.name });
      setProgress(100);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      onUploaded(`已上传 ${finish.package?.name || current.name}`);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc));
      setProgress(0);
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  return (
    <div className="pc-modal-mask" onClick={close}>
      <aside className="pc-up gw-glass" onClick={(e) => e.stopPropagation()} aria-label="上传套件">
        <div className="pc-up-head">
          <div>
            <h2>上传套件</h2>
            <p>把打包好的 .spk 拖进来，立刻出现在列表和 DSM 套件来源中。</p>
          </div>
          <button type="button" className="gw-icon-button" aria-label="关闭上传" onClick={close}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div
          className={`pc-up-drop${drag ? " is-drag" : ""}${file ? " has-file" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".spk"
            hidden
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <>
              <span className="pc-up-icon"><FileArchive size={22} aria-hidden="true" /></span>
              <strong>{file.name}</strong>
              <span>{(file.size / 1024 / 1024).toFixed(2)} MB · 点击可重新选择</span>
            </>
          ) : done ? (
            <>
              <span className="pc-up-icon"><Check size={22} aria-hidden="true" /></span>
              <strong>{done.name || "已上传"}</strong>
              <span>已加入套件中心，可继续拖入下一个安装包</span>
            </>
          ) : (
            <>
              <span className="pc-up-icon"><UploadCloud size={22} aria-hidden="true" /></span>
              <strong>拖拽 .spk 到这里，或点击选择文件</strong>
              <span>支持单包最大 2 GB · 自动分片上传，断网可重试</span>
            </>
          )}
        </div>

        {tokenRequired && (
          <label className="pc-up-token">
            <span>管理令牌</span>
            <input
              type="password"
              value={token}
              placeholder="容器设置了 GPC_ADMIN_TOKEN"
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
        )}

        {busy && (
          <div className="pc-up-progress" aria-live="polite">
            <span style={{ width: `${progress}%` }} />
            <em>{progress}%</em>
          </div>
        )}

        {error && (
          <p className="pc-up-msg is-error">
            <AlertCircle size={15} aria-hidden="true" />
            {error}
          </p>
        )}

        {done && (
          <div className="pc-up-msg is-done">
            <Check size={15} aria-hidden="true" />
            <div>
              <strong>{done.name}</strong>
              <span>
                {done.v ? `版本 ${done.v}` : ""}
                {done.arch?.length ? ` · ${done.arch.join(" · ")}` : ""}
                {done.size ? ` · ${done.size}` : ""}
              </span>
            </div>
          </div>
        )}

        <div className="pc-up-foot">
          <button type="button" className="gw-button" onClick={close} disabled={busy}>
            关闭
          </button>
          <button type="button" className="gw-button pc-up-send" onClick={send} disabled={!file || busy}>
            {busy ? <Loader2 size={14} className="pc-spin" aria-hidden="true" /> : <UploadCloud size={14} aria-hidden="true" />}
            {busy ? "上传中…" : "开始上传"}
          </button>
        </div>
      </aside>
    </div>
  );
}
