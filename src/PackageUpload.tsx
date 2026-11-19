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

type UploadedPkg = { name?: string; v?: string; arch?: string[]; size?: string; origin?: string };

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
    setFile(f);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDrag(false);
    pick(e.dataTransfer.files?.[0] ?? null);
  };

  const send = () => {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    setProgress(0);
    const q = new URLSearchParams({ name: file.name });
    if (token) q.set("token", token);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `api/upload?${q.toString()}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setBusy(false);
      let data: { ok?: boolean; error?: string; package?: UploadedPkg } | null = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.ok) {
        // 令牌存下来，后续删除 / 上下线可直接复用
        try {
          if (token) window.localStorage.setItem("gpc_token", token);
        } catch {
          /* 隐私模式下写入会失败，忽略 */
        }
        setDone(data.package ?? { name: file.name });
        setProgress(100);
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
        onUploaded(`已上传 ${data.package?.name || file.name}`);
      } else {
        setError(data?.error || `上传失败（HTTP ${xhr.status}）`);
      }
    };
    xhr.onerror = () => {
      setBusy(false);
      setError("网络中断，上传没有完成");
    };
    xhr.send(file);
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
              <span>支持单包最大 512 MB，上传后自动解析名称、版本与架构</span>
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
