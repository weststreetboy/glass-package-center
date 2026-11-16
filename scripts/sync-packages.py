#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 SSPKS-IMNKS 套件源目录扫描 .spk，重新生成 src/packages.data.ts
并复制安装包到 webroot/packages/ 供下载。

用法：
  python3 scripts/sync-packages.py
  PACKAGES_DIR=/path/to/sspks/packages python3 scripts/sync-packages.py
  DSM_SOURCE_URL=https://nas.example.com/sspks/ python3 scripts/sync-packages.py

生成后重新构建： npm run build && node scripts/build-standalone.mjs
"""
import os, io, re, sys, json, tarfile, base64, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

PACKAGES_DIR = os.environ.get("PACKAGES_DIR") or os.path.join(ROOT, "webroot", "packages")
OUT_DIR = os.path.join(ROOT, "webroot", "packages")
DATA_TS = os.path.join(ROOT, "src", "packages.data.ts")
SOURCE_URL = os.environ.get("DSM_SOURCE_URL") or "https://dsm-package-center.app.workbuddy.host/"

CATEGORY_KEYWORDS = [
    ("多媒体", ("media", "photo", "video", "emby", "plex", "music", "transcode")),
    ("网络", ("sync", "vpn", "proxy", "dns", "torrent", "download", "tailscale", "wireguard", "reverse", "ddns")),
    ("工具", ("tool", "util", "sspks", "repo", "center", "manager", "dashboard")),
    ("系统", ("docker", "container", "backup", "storage", "system", "hyper", "virtual")),
    ("安全", ("vault", "warden", "password", "security", "auth", "firewall")),
    ("开发", ("node", "python", "php", "dev", "code", "git")),
]
ARCH_ORDER = {"x86_64": 0, "armv8": 1, "noarch": 2}


def human_size(n):
    for u in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.0f} {u}" if u == "B" else f"{n:.1f} {u}"
        n /= 1024
    return f"{n:.1f} TB"


def read_info_and_icon(spk):
    """返回 (INFO 字节, 图标 data URI 或 None)。支持扁平与嵌套 package.tgz。"""
    try:
        with tarfile.open(spk) as t:
            names = t.getnames()
            info_b = None
            if "INFO" in names:
                info_b = t.extractfile("INFO").read()
            else:
                for n in names:
                    if n.endswith("package.tgz"):
                        data = t.extractfile(n).read()
                        with tarfile.open(fileobj=io.BytesIO(data)) as t2:
                            if "INFO" in t2.getnames():
                                info_b = t2.extractfile("INFO").read()
                        break
            icon = None
            cand = [n for n in names if re.search(r"icon.*\.png$", n, re.I)]
            if cand:
                pref = sorted(cand, key=lambda n: (0 if "256" in n.lower() else 1, n.lower()))[0]
                raw = t.extractfile(pref).read()
                if raw[:8] == b"\x89PNG\r\n\x1a\n":
                    icon = "data:image/png;base64," + base64.b64encode(raw).decode("ascii")
            return info_b, icon
    except Exception as e:
        print("  [warn] 解析失败", os.path.basename(spk), e, file=sys.stderr)
        return None, None


def parse_info(b):
    d = {}
    for line in b.decode("utf-8", "replace").splitlines():
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in ("'", '"'):
            v = v[1:-1]
        d[k.strip()] = v
    return d


def norm_arch(raw):
    raw = (raw or "").strip()
    if not raw or raw == "noarch":
        return ["noarch"]
    toks = re.split(r"[\s,]+", raw)
    out = set()
    for t in toks:
        tl = t.lower()
        if tl == "noarch":
            out.add("noarch")
        elif tl in ("x86_64", "x86", "amd64") or "apollolake" in tl or "avoton" in tl:
            out.add("x86_64")
        elif tl in ("armv8", "aarch64", "arm64") or "rtd1296" in tl or "armada38x" in tl:
            out.add("armv8")
    if not out:
        out.add("noarch")
    return sorted(out, key=lambda x: ARCH_ORDER.get(x, 9))


def infer_cat(name, info):
    blob = (name + " " + info.get("description", "")).lower()
    for cat, kws in CATEGORY_KEYWORDS:
        if any(k in blob for k in kws):
            return cat
    return "工具"


def main():
    if not os.path.isdir(PACKAGES_DIR):
        print("[x] 套件目录不存在：", PACKAGES_DIR, file=sys.stderr)
        sys.exit(1)
    files = sorted(f for f in os.listdir(PACKAGES_DIR) if f.endswith(".spk"))
    os.makedirs(OUT_DIR, exist_ok=True)
    pkgs = []
    for f in files:
        spk = os.path.join(PACKAGES_DIR, f)
        info_b, icon = read_info_and_icon(spk)
        if not info_b:
            print("  [skip] 无 INFO：", f)
            continue
        info = parse_info(info_b)
        pid = info.get("package", f.rsplit("-", 1)[0])
        name = info.get("displayname") or info.get("package") or pid
        size = os.path.getsize(spk)
        pkgs.append({
            "id": pid,
            "name": name,
            "en": info.get("package", pid),
            "cat": info.get("category") or infer_cat(name, info),
            "v": info.get("version", ""),
            "desc": info.get("description", ""),
            "long": info.get("description", ""),
            "arch": norm_arch(info.get("arch", "noarch")),
            "dsm": (re.match(r"(\d+\.\d+)", info.get("os_min_ver", "7.0")) or type("M", (), {"group": lambda s, n: "7.0"})()).group(1),
            "ch": "beta" if info.get("beta", "").lower() in ("yes", "true", "1") else "stable",
            "file": f,
            "size": human_size(size),
            "sizeBytes": size,
            "icon": icon,
            "official": (info.get("distributor", "").lower().startswith("synology")
                         or info.get("maintainer", "").lower().startswith("synology")),
            "real": True,
        })
        dst = os.path.join(OUT_DIR, f)
        if os.path.abspath(spk) != os.path.abspath(dst):
            shutil.copy2(spk, dst)
        print(f"  [ok] {f} {name} v{info.get('version','')} {human_size(size)}")

    source = {"url": SOURCE_URL, "note": "部署到 NAS 后请把此地址改成你自己的 SSPKS 源地址。"}
    lines = [
        "// 由 scripts/sync-packages.py 自动生成，请勿手改。",
        "export type Pkg = { id:string; name:string; en:string; cat:string; v:string; desc:string; long:string; arch:string[]; dsm:string; ch:string; file:string; size:string; sizeBytes:number; icon:string; official:boolean; real:boolean };",
        "export const PACKAGES: Pkg[] = [",
    ]
    for p in pkgs:
        lines.append("  " + json.dumps(p, ensure_ascii=False) + ",")
    lines.append("];")
    lines.append("export const SOURCE = " + json.dumps(source, ensure_ascii=False) + ";")
    with open(DATA_TS, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    print(f"\n[ok] 生成 {DATA_TS}  套件数={len(pkgs)}")
    print("[next] npm run build && node scripts/build-standalone.mjs")


if __name__ == "__main__":
    main()
