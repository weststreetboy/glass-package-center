#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 SSPKS-IMNKS 套件源目录扫描 .spk，重新生成 src/packages.data.ts
并复制安装包到 webroot/packages/ 供下载。

支持多目录（逗号分隔）与递归扫描、自动去重、体积上限过滤；
已存在的套件会保留 src/packages.data.ts 中人工整理的中文名称与描述。

用法：
  python3 scripts/sync-packages.py
  PACKAGES_DIR=C:/path/to/sspks-imnks python3 scripts/sync-packages.py
  PACKAGES_DIR=C:/a,C:/b MAX_SIZE_MB=100 python3 scripts/sync-packages.py
  DSM_SOURCE_URL=https://nas.example.com/sspks/ python3 scripts/sync-packages.py

生成后重新构建： npm run build && node scripts/build-standalone.mjs
"""
import os, io, re, sys, json, tarfile, base64, shutil, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS_DIR = HERE
ROOT = os.path.dirname(HERE)

PACKAGES_DIR = os.environ.get("PACKAGES_DIR") or os.path.join(ROOT, "webroot", "packages")
OUT_DIR = os.path.join(ROOT, "webroot", "packages")
ROOT_PACKAGES = os.path.join(ROOT, "packages")
DATA_TS = os.path.join(ROOT, "src", "packages.data.ts")
SOURCE_URL = os.environ.get("DSM_SOURCE_URL") or "https://dsm-package-center.app.workbuddy.host/"
MAX_SIZE_MB = float(os.environ.get("MAX_SIZE_MB") or "100")

CATEGORY_KEYWORDS = [
    ("多媒体", ("media", "photo", "video", "emby", "plex", "music", "transcode")),
    ("网络", ("sync", "vpn", "proxy", "dns", "torrent", "download", "tailscale", "wireguard", "reverse", "ddns")),
    ("工具", ("tool", "util", "sspks", "repo", "center", "manager", "dashboard")),
    ("系统", ("docker", "container", "backup", "storage", "system", "hyper", "virtual")),
    ("安全", ("vault", "warden", "password", "security", "auth", "firewall")),
    ("开发", ("node", "python", "php", "dev", "code", "git")),
]
ARCH_ORDER = {"x86_64": 0, "armv8": 1, "noarch": 2}

# 新套件的中文兜底（已存在的套件从旧 data.ts 继承，不会覆盖）
CN_OVERRIDES = {
    "sspksrepo_armv8-7.0_1.1.0-0001.spk": {
        "name": "SSPKS-IMNKS 套件中心（ARM）",
        "desc": "自托管的 DSM 7 套件中心（SSPKS-IMNKS）；ARM 架构版，内置 PHP 8.4 命令行工具。",
    },
    "MyApp_noarch-7.0_1.0.0-0002.spk": {
        "name": "我的应用",
        "desc": "SSPKS-IMNKS 仓库的示例应用套件，可用于验证套件安装流程。",
    },
    "crabapple-panel_x86_64-7.0_2.0.3-0016.spk": {
        "name": "Crabapple 导航面板",
        "desc": "Crabapple Panel 局域网导航站 · Go 后端 + SQLite，内置备份还原与数据库自愈；0016 精简版（不含图标库与壁纸），管理端口 13800。",
    },
}

SOURCE_NOTE = ("此地址为已部署的演示实例；真实部署请填写你 NAS 上 SSPKS 的来源地址。"
               "注意：云端实例受平台网关限制，DSM 套件中心握手建议在 NAS 本机完成。")


def human_size(n):
    for u in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.0f} {u}" if u == "B" else f"{n:.1f} {u}"
        n /= 1024
    return f"{n:.1f} TB"


def collect_spks(spec):
    """支持逗号分隔的多个目录，递归查找 .spk。"""
    found, seen = [], set()
    for raw in spec.split(","):
        d = os.path.expanduser(raw.strip())
        if not d or not os.path.isdir(d):
            print("  [warn] 目录不存在：", d, file=sys.stderr)
            continue
        for dp, _dn, fn in os.walk(d):
            for f in fn:
                if f.lower().endswith(".spk"):
                    p = os.path.abspath(os.path.join(dp, f))
                    if p not in seen:
                        seen.add(p)
                        found.append(p)
    return found


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


def load_existing():
    """读取现有 data.ts，按文件名索引，用于保留人工中文。"""
    out = {}
    if not os.path.exists(DATA_TS):
        return out
    txt = open(DATA_TS, encoding="utf-8").read()
    for m in re.finditer(r"^\s*(\{.*\})\s*,?\s*$", txt, re.M):
        try:
            p = json.loads(m.group(1))
            if isinstance(p, dict) and p.get("file"):
                out[p["file"]] = p
        except Exception:
            pass
    return out


def main():
    spks = collect_spks(PACKAGES_DIR)
    if not spks:
        print("[x] 未找到任何 .spk：", PACKAGES_DIR, file=sys.stderr)
        sys.exit(1)
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(ROOT_PACKAGES, exist_ok=True)

    existing = load_existing()
    candidates = []
    for spk in spks:
        f = os.path.basename(spk)
        size = os.path.getsize(spk)
        if size > MAX_SIZE_MB * 1024 * 1024:
            print(f"  [skip-large] {f} {human_size(size)} > {MAX_SIZE_MB:g} MB")
            continue
        info_b, icon = read_info_and_icon(spk)
        if not info_b:
            print("  [skip] 无 INFO：", f)
            continue
        info = parse_info(info_b)
        key = (info.get("package", ""), info.get("version", ""), info.get("arch", ""), size)
        # 正式 packages/ 目录优先于 _local 构建产物
        priority = 0 if os.sep + "packages" + os.sep in spk.replace("/", os.sep) and "_local" not in spk else 1
        candidates.append((key, priority, f, spk, size, info, icon))

    # 去重：相同 包名+版本+架构+体积 只保留一份
    best = {}
    for c in candidates:
        key, priority = c[0], c[1]
        if key not in best or priority < best[key][1]:
            best[key] = c
    chosen = sorted(best.values(), key=lambda c: (c[5].get("package", ""), c[5].get("version", ""), c[2]))

    pkgs = []
    for _key, _pri, f, spk, size, info, icon in chosen:
        pid = info.get("package", f.rsplit("-", 1)[0])
        name = info.get("displayname") or info.get("package") or pid
        desc = info.get("description", "")
        old = existing.get(f, {})
        over = CN_OVERRIDES.get(f, {})
        name = over.get("name") or old.get("name") or name
        desc = over.get("desc") or old.get("desc") or desc
        item = {
            "id": pid,
            "name": name,
            "en": info.get("package", pid),
            "cat": old.get("cat") or info.get("category") or infer_cat(name, info),
            "v": info.get("version", ""),
            "desc": desc,
            "long": old.get("long") or desc,
            "arch": norm_arch(info.get("arch", "noarch")),
            "dsm": old.get("dsm") or (re.match(r"(\d+\.\d+)", info.get("os_min_ver", "7.0")) or type("M", (), {"group": lambda s, n: "7.0"})()).group(1),
            "ch": old.get("ch") or ("beta" if info.get("beta", "").lower() in ("yes", "true", "1") else "stable"),
            "file": f,
            "size": human_size(size),
            "sizeBytes": size,
            "icon": old.get("icon") or icon,
            "official": old.get("official", info.get("distributor", "").lower().startswith("synology") or info.get("maintainer", "").lower().startswith("synology")),
            "real": True,
        }
        pkgs.append(item)
        for dst_dir in (OUT_DIR, ROOT_PACKAGES):
            dst = os.path.join(dst_dir, f)
            if os.path.abspath(spk) != os.path.abspath(dst):
                shutil.copy2(spk, dst)
        print(f"  [ok] {f} {name} v{item['v']} {human_size(size)}")

    source = {"url": SOURCE_URL, "note": SOURCE_NOTE}
    lines = [
        "// 由 scripts/sync-packages.py 自动生成，请勿手改。",
        "export type Pkg = { id:string; name:string; en:string; cat:string; v:string; desc:string; long:string; arch:string[]; dsm:string; ch:string; file:string; size:string; sizeBytes:number; icon:string; official:boolean; real:boolean; origin?:string };",
        "export const PACKAGES: Pkg[] = [",
    ]
    for p in pkgs:
        lines.append("  " + json.dumps(p, ensure_ascii=False) + ",")
    lines.append("];")
    lines.append("export const SOURCE = " + json.dumps(source, ensure_ascii=False) + ";")
    with open(DATA_TS, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    print(f"\n[ok] 生成 {DATA_TS}  套件数={len(pkgs)}")

    # 同步输出运行时目录：容器内的 server/app.py 以它为「内置套件」基线，
    # 运行时上传/扫描到的 SPK 再叠加在这份基线之上。
    catalog_path = os.path.join(ROOT, "webroot", "catalog.json")
    with open(catalog_path, "w", encoding="utf-8") as fh:
        json.dump({"packages": pkgs, "source": source}, fh, ensure_ascii=False)
        fh.write("\n")
    print(f"[ok] 生成 {catalog_path}  套件数={len(pkgs)}")

    # 同步生成 DSM 套件中心协议清单（webroot/dsm/*.json）
    # 这样套件增删后，DSM 来源看到的安装包列表会一起更新。
    dsm_script = os.path.join(SCRIPTS_DIR, "build-dsm-index.py")
    if os.path.isfile(dsm_script):
        print("\n[next] 同步 DSM 套件来源清单 ...")
        subprocess.run([sys.executable, dsm_script], check=True)
    else:
        print(f"\n[warn] 未找到 {dsm_script}，跳过 DSM 清单生成")

    print("[next] npm run build && node scripts/build-standalone.mjs")


if __name__ == "__main__":
    main()
