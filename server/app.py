#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
玻璃套件中心 · 运行时服务（单文件、仅用 Python 标准库）

相比原来的纯静态 nginx，这里多做了三件事：
  1) 接收上传的 .spk，解析 INFO 与图标，落盘后立刻出现在页面和 DSM 来源里；
  2) 定时扫描挂载进来的目录（例如 SPK 工作室的 builds），自动收录新包；
  3) 动态生成 DSM 套件来源清单，链接地址按实际访问域名拼装。

目录约定
    webroot/                 构建产物（index.html / packages/ / catalog.json）
    /data/packages/          上传的 SPK（建议挂载为持久卷）
    /data/registry.json      运行时登记的套件（上传 + 扫描）
    /import/                 可选：自动扫描目录，只读挂载即可

环境变量
    GPC_PORT            监听端口，默认 80
    GPC_DATA_DIR        持久化目录，默认 /data
    GPC_IMPORT_DIRS     自动扫描目录，冒号分隔，默认 /import
    GPC_SCAN_INTERVAL   扫描间隔秒数，默认 30；设为 0 关闭定时扫描
    GPC_MAX_UPLOAD_MB   单包上传上限，默认 512
    GPC_ADMIN_TOKEN     设置后，上传/删除/扫描需要携带该令牌
    GPC_PUBLIC_URL      清单里 link/thumbnail 的对外地址，如 http://192.168.50.4:13801
                        DSM 下载失败但图标正常时，设为 DSM 实际可访问的地址即可
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import re
import sys
import tarfile
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
WEBROOT = os.environ.get("GPC_WEBROOT") or os.path.join(PROJECT, "webroot")
DATA_DIR = os.environ.get("GPC_DATA_DIR") or "/data"
UPLOAD_DIR = os.path.join(DATA_DIR, "packages")
REGISTRY_PATH = os.path.join(DATA_DIR, "registry.json")
STATE_PATH = os.path.join(DATA_DIR, "state.json")
CATALOG_PATH = os.path.join(WEBROOT, "catalog.json")
BUILTIN_DIR = os.path.join(WEBROOT, "packages")

PORT = int(os.environ.get("GPC_PORT") or 80)
# 清单里 link/thumbnail 使用的对外地址。DSM 下载器会按 link 重新建立独立连接，
# 若经反代或 DSM 带自定义 Host，按请求头拼出的地址可能与 DSM 实际可达地址不符。
# 配置后（如 http://192.168.50.4:13801）清单地址固定，避免下载失败。
PUBLIC_URL = (os.environ.get("GPC_PUBLIC_URL") or "").strip()
ADMIN_TOKEN = (os.environ.get("GPC_ADMIN_TOKEN") or "").strip()
MAX_UPLOAD_BYTES = int(float(os.environ.get("GPC_MAX_UPLOAD_MB") or 512) * 1024 * 1024)
SCAN_INTERVAL = int(os.environ.get("GPC_SCAN_INTERVAL") or 30)
IMPORT_DIRS = [
    p.strip()
    for p in (os.environ.get("GPC_IMPORT_DIRS") or "/import").replace(";", os.pathsep).split(os.pathsep)
    if p.strip()
]

ARCH_ORDER = {"x86_64": 0, "armv8": 1, "noarch": 2}
CATEGORY_KEYWORDS = [
    ("多媒体", ("media", "photo", "video", "emby", "plex", "music", "transcode")),
    ("网络", ("sync", "vpn", "proxy", "dns", "torrent", "download", "tailscale", "wireguard", "reverse", "dddn", "ddns")),
    ("工具", ("tool", "util", "sspks", "repo", "center", "manager", "dashboard", "panel", "nav")),
    ("系统", ("docker", "container", "backup", "storage", "system", "hyper", "virtual")),
    ("安全", ("vault", "warden", "password", "security", "auth", "firewall")),
    ("开发", ("node", "python", "php", "dev", "code", "git")),
]

MAINTAINER = "weststreetboy"
MAINTAINER_URL = "https://github.com/weststreetboy/glass-package-center"

_lock = threading.RLock()
_state: dict = {"builtin": [], "runtime": {}, "offline": set(), "ready": False}
_md5_cache: dict = {}
_icon_cache: dict = {}


# --------------------------------------------------------------------------- #
# 工具函数
# --------------------------------------------------------------------------- #
def log(*args) -> None:
    print("[gpc]", *args, flush=True)


def human_size(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


def md5_file(path: str) -> str:
    try:
        st = os.stat(path)
    except OSError:
        return ""
    key = (path, st.st_size, int(st.st_mtime))
    cached = _md5_cache.get(key)
    if cached:
        return cached
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    digest = h.hexdigest()
    _md5_cache[key] = digest
    return digest


def norm_arch(raw: str) -> list[str]:
    raw = (raw or "").strip()
    if not raw or raw.lower() == "noarch":
        return ["noarch"]
    out = set()
    for tok in re.split(r"[\s,]+", raw):
        t = tok.lower()
        if not t:
            continue
        if t == "noarch":
            out.add("noarch")
        elif t in ("x86_64", "x86", "amd64", "i686") or "apollolake" in t or "avoton" in t or "geminilake" in t:
            out.add("x86_64")
        elif t in ("armv8", "aarch64", "arm64") or "rtd1296" in t or "armada38x" in t or "alpine" in t:
            out.add("armv8")
        elif t in ("armv7", "armada370", "armada375", "armada38x"):
            out.add("armv8")
    if not out:
        out.add("noarch")
    return sorted(out, key=lambda x: ARCH_ORDER.get(x, 9))


def infer_cat(name: str, desc: str) -> str:
    blob = f"{name} {desc}".lower()
    for cat, keys in CATEGORY_KEYWORDS:
        if any(k in blob for k in keys):
            return cat
    return "工具"


def parse_info(raw: bytes) -> dict:
    info: dict = {}
    for line in raw.decode("utf-8", "replace").splitlines():
        if "=" not in line or line.lstrip().startswith("#"):
            continue
        k, v = line.split("=", 1)
        v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in ("'", '"'):
            v = v[1:-1]
        info[k.strip()] = v
    return info


def read_spk_meta(path: str) -> tuple[dict | None, str | None]:
    """读取 SPK 的 INFO 与最大尺寸 PNG 图标（返回 data URI）。"""
    try:
        with tarfile.open(path) as tar:
            names = tar.getnames()
            info_raw = None
            if "INFO" in names:
                info_raw = tar.extractfile("INFO").read()
            else:
                for n in names:
                    if n.endswith("package.tgz"):
                        inner = tar.extractfile(n).read()
                        with tarfile.open(fileobj=io.BytesIO(inner)) as tar2:
                            if "INFO" in tar2.getnames():
                                info_raw = tar2.extractfile("INFO").read()
                        break
            icon = None
            cands = [n for n in names if re.search(r"icon.*\.png$", n, re.I)]
            if cands:
                cands.sort(key=lambda n: (0 if "256" in n.lower() else 1, n.lower()))
                blob = tar.extractfile(cands[0]).read()
                if blob[:8] == b"\x89PNG\r\n\x1a\n":
                    icon = "data:image/png;base64," + base64.b64encode(blob).decode("ascii")
            return (parse_info(info_raw) if info_raw else None), icon
    except Exception as exc:  # noqa: BLE001 - 用户上传的包可能是任意内容
        log("解析失败", os.path.basename(path), exc)
        return None, None


def spk_icon_bytes(entry: dict) -> bytes | None:
    """套件图标 PNG 字节。内置条目直接用 catalog 里的 data URI，运行时条目从 SPK 内提取。

    带进程内缓存：DSM 每次刷新来源都会逐个拉图标，反复解 20 MB 的 tar 不可接受。
    """
    data_uri = entry.get("icon") or ""
    if data_uri.startswith("data:image/png;base64,"):
        try:
            return base64.b64decode(data_uri.split(",", 1)[1])
        except Exception:  # noqa: BLE001
            return None

    path = entry.get("path") or ""
    if not path or not os.path.isfile(path):
        return None
    cached = _icon_cache.get(path)
    if cached is not None:
        return cached or None

    blob = None
    try:
        with tarfile.open(path) as tar:
            cands = sorted(
                (n for n in tar.getnames() if re.search(r"icon.*\.png$", n, re.I)),
                key=lambda n: (0 if "256" in n.lower() else 1, n.lower()),
            )
            for n in cands:
                data = tar.extractfile(n).read()
                if data[:8] == b"\x89PNG\r\n\x1a\n":
                    blob = data
                    break
    except Exception as exc:  # noqa: BLE001
        log("图标提取失败", os.path.basename(path), exc)
    if len(_icon_cache) > 256:
        _icon_cache.clear()
    _icon_cache[path] = blob or b""
    return blob


def build_entry(path: str, file_name: str, origin: str) -> dict:
    info, icon = read_spk_meta(path)
    if info is None:
        raise ValueError("这个文件里没有 INFO，不是有效的 DSM 套件")
    size = os.path.getsize(path)
    pid = info.get("package") or os.path.splitext(file_name)[0]
    name = info.get("displayname") or pid
    desc = info.get("description") or ""
    dsm_raw = info.get("os_min_ver") or "7.0"
    m = re.match(r"(\d+\.\d+)", dsm_raw)
    return {
        "id": pid,
        "name": name,
        "en": info.get("package") or pid,
        "cat": infer_cat(name, desc),
        "v": info.get("version") or "",
        "desc": desc or "本地导入的 DSM 套件。",
        "long": desc or "本地导入的 DSM 套件。",
        "arch": norm_arch(info.get("arch", "noarch")),
        "dsm": m.group(1) if m else "7.0",
        "ch": "beta" if str(info.get("beta", "")).lower() in ("yes", "true", "1") else "stable",
        "file": file_name,
        "size": human_size(size),
        "sizeBytes": size,
        "icon": icon,
        "official": str(info.get("maintainer", "")).lower().startswith("synology"),
        "real": True,
        "origin": origin,
        "path": path,
        "addedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }


# --------------------------------------------------------------------------- #
# 登记表
# --------------------------------------------------------------------------- #
def load_catalog() -> list[dict]:
    if not os.path.isfile(CATALOG_PATH):
        log("未找到 catalog.json，回退为扫描 webroot/packages")
        out = []
        if os.path.isdir(BUILTIN_DIR):
            for f in sorted(os.listdir(BUILTIN_DIR)):
                if not f.lower().endswith(".spk"):
                    continue
                p = os.path.join(BUILTIN_DIR, f)
                try:
                    out.append(build_entry(p, f, "builtin"))
                except ValueError:
                    continue
        return out
    with open(CATALOG_PATH, encoding="utf-8") as fh:
        data = json.load(fh)
    items = []
    for p in data.get("packages", []):
        entry = dict(p)
        entry["origin"] = "builtin"
        entry["path"] = os.path.join(BUILTIN_DIR, entry["file"])
        items.append(entry)
    return items


def load_registry() -> dict:
    if not os.path.isfile(REGISTRY_PATH):
        return {}
    try:
        with open(REGISTRY_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
        return {e["file"]: e for e in data.get("packages", []) if e.get("file")}
    except Exception as exc:  # noqa: BLE001
        log("registry.json 读取失败，忽略：", exc)
        return {}


def save_registry() -> None:
    with _lock:
        items = list(_state["runtime"].values())
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = REGISTRY_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump({"version": 1, "packages": items}, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, REGISTRY_PATH)


def load_state() -> set:
    """读取下线集合（按文件名）。文件缺失或损坏时视为全部在线。"""
    if not os.path.isfile(STATE_PATH):
        return set()
    try:
        with open(STATE_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
        return {str(x) for x in data.get("offline", []) if x}
    except Exception as exc:  # noqa: BLE001
        log("state.json 读取失败，忽略：", exc)
        return set()


def save_state() -> None:
    with _lock:
        items = sorted(_state["offline"])
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump({"version": 1, "offline": items}, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, STATE_PATH)


def set_online(file_name: str, online: bool) -> bool:
    """切换套件是否出现在 DSM 套件来源中；返回是否命中已知套件。

    下线只影响 DSM 清单，页面仍保留条目并标注，方便随时恢复或自查。
    """
    if not any(e.get("file") == file_name for e in all_entries()):
        return False
    with _lock:
        if online:
            _state["offline"].discard(file_name)
        else:
            _state["offline"].add(file_name)
    save_state()
    log("状态切换", file_name, "上线" if online else "下线")
    return True


def version_key(v: str) -> tuple:
    return tuple(int(x) if x.isdigit() else 0 for x in re.split(r"[.\-_+]", v or ""))


def entry_key(entry: dict) -> tuple:
    """同一套件、同一批架构算一条；包名大小写不敏感（不同分支构建常写成 Crabapple-Panel）。"""
    return (str(entry.get("en") or entry.get("id") or "").lower(), tuple(sorted(entry.get("arch") or [])))


def dedupe(entries: list[dict]) -> list[dict]:
    """同一套件多版本并存时只保留最高版本；版本相同时内置条目优先。"""
    best: dict = {}
    order: list = []
    for e in entries:
        key = entry_key(e)
        cur = best.get(key)
        if cur is None:
            best[key] = e
            order.append(key)
            continue
        if version_key(e.get("v")) > version_key(cur.get("v")):
            best[key] = e
        elif version_key(e.get("v")) == version_key(cur.get("v")):
            if cur.get("origin") != "builtin" and e.get("origin") == "builtin":
                best[key] = e
    return [best[k] for k in order]


def all_entries() -> list[dict]:
    with _lock:
        merged = list(_state["builtin"]) + list(_state["runtime"].values())
        offline = set(_state["offline"])
    out = []
    for e in dedupe(merged):
        item = dict(e)
        item["online"] = str(item.get("file")) not in offline
        out.append(item)
    return out


def register(entry: dict) -> None:
    """登记运行时套件；同包名 + 同版本视为升级，替换旧的。"""
    key = entry_key(entry)
    with _lock:
        for old_key, old in list(_state["runtime"].items()):
            if entry_key(old) == key and old.get("v") == entry.get("v"):
                _state["runtime"].pop(old_key, None)
                if old.get("origin") == "upload" and old.get("path") != entry.get("path"):
                    try:
                        os.remove(old["path"])
                    except OSError:
                        pass
        _state["runtime"][entry["file"]] = entry
    _icon_cache.pop(entry.get("path") or "", None)
    save_registry()


def unregister(file_name: str) -> bool:
    with _lock:
        entry = _state["runtime"].pop(file_name, None)
        was_offline = file_name in _state["offline"]
        _state["offline"].discard(file_name)
    if not entry:
        return False
    if was_offline:
        save_state()
    save_registry()
    if entry.get("origin") == "upload":
        try:
            os.remove(entry["path"])
        except OSError:
            pass
    return True


# --------------------------------------------------------------------------- #
# 自动扫描
# --------------------------------------------------------------------------- #
def scan_imports() -> list[dict]:
    added: list[dict] = []
    if not IMPORT_DIRS:
        return added
    existing = all_entries()
    known_files = {e.get("file") for e in existing}
    # 每个套件只保留最高版本，扫描到旧构建时直接跳过，避免登记表越堆越大
    best: dict = {}
    for e in existing:
        k = entry_key(e)
        vk = version_key(e.get("v"))
        if k not in best or vk > best[k]:
            best[k] = vk
    for root in IMPORT_DIRS:
        if not os.path.isdir(root):
            continue
        for dirpath, _dirnames, filenames in os.walk(root):
            for fname in sorted(filenames):
                if not fname.lower().endswith(".spk") or fname in known_files:
                    continue
                full = os.path.abspath(os.path.join(dirpath, fname))
                try:
                    entry = build_entry(full, fname, "scan")
                except ValueError:
                    continue
                key = entry_key(entry)
                vk = version_key(entry["v"])
                if key in best and vk <= best[key]:
                    continue
                best[key] = vk
                known_files.add(fname)
                register(entry)
                added.append(entry)
                log("扫描收录", fname, entry["v"])
    return added


def scan_loop() -> None:
    while True:
        time.sleep(max(5, SCAN_INTERVAL))
        try:
            scan_imports()
        except Exception as exc:  # noqa: BLE001
            log("扫描出错", exc)


# --------------------------------------------------------------------------- #
# DSM 清单
# --------------------------------------------------------------------------- #
def dsm_payload(arch: str, origin: str) -> dict:
    arch = (arch or "x86_64").lower()
    if arch not in ("x86_64", "armv8"):
        arch = "noarch" if arch == "noarch" else "x86_64"
    items = []
    for e in all_entries():
        # 已下线的套件不出现在 DSM 套件来源里
        if not e.get("online", True):
            continue
        arches = e.get("arch") or ["noarch"]
        if arch == "noarch":
            if "noarch" not in arches:
                continue
        elif "noarch" not in arches and arch not in arches:
            continue
        path = e.get("path") or os.path.join(BUILTIN_DIR, e["file"])
        if not os.path.isfile(path):
            continue
        items.append(
            {
                "package": e.get("en") or e.get("id"),
                "version": e.get("v") or "1.0.0",
                "dname": e.get("name") or e.get("en"),
                "desc": e.get("desc") or "",
                "price": 0,
                "download_count": 2026,
                "recent_download_count": 0,
                "link": f"{origin}/packages/{urllib.parse.quote(e['file'])}",
                "size": os.path.getsize(path),
                "md5": md5_file(path),
                # DSM 只认 thumbnail 里的 URL：留空会让套件中心列表显示默认占位图标
                "thumbnail": [
                    f"{origin}/api/icon/{urllib.parse.quote(e['file'])}?size=256",
                    f"{origin}/api/icon/{urllib.parse.quote(e['file'])}?size=72",
                ],
                "snapshot": [],
                "qinst": True,
                "qstart": True,
                "qupgrade": True,
                "depsers": None,
                "deppkgs": None,
                "conflictpkgs": None,
                "start": True,
                "maintainer": MAINTAINER,
                "maintainer_url": MAINTAINER_URL,
                "distributor": MAINTAINER,
                "distributor_url": MAINTAINER_URL,
                "support_url": MAINTAINER_URL + "/issues",
                "changelog": e.get("long") or e.get("desc") or "",
                "thirdparty": True,
                "category": 0,
                "subcategory": 0,
                "type": 0,
                "silent_install": False,
                "silent_uninstall": False,
                "silent_upgrade": False,
                "auto_upgrade_from": None,
            }
        )
    return {"packages": items}


# --------------------------------------------------------------------------- #
# HTTP
# --------------------------------------------------------------------------- #
class Handler(BaseHTTPRequestHandler):
    server_version = "GlassPackageCenter/3.0"
    protocol_version = "HTTP/1.1"

    # ---- 通用响应 ----
    def _json(self, obj, status: int = 200) -> None:
        body = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache, must-revalidate")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _error(self, status: int, message: str) -> None:
        self._json({"ok": False, "error": message}, status)

    def _origin(self) -> str:
        # 显式配置的对外地址优先级最高：DSM 按清单里的 link 取包，
        # 一旦请求头里的 Host/Proto 与 DSM 实际可达地址不一致，就会出现
        # 「图标能显示、下载失败」——因为图标与清单用同一 Host 拼接，
        # 但 DSM 下载器对 link 会重新发起独立连接。
        if PUBLIC_URL:
            return PUBLIC_URL.rstrip("/")
        proto = (self.headers.get("X-Forwarded-Proto") or "http").split(",")[0].strip()
        host = (self.headers.get("X-Forwarded-Host") or self.headers.get("Host") or "localhost").split(",")[0].strip()
        host = re.sub(r"[^0-9A-Za-z.\-:\[\]]", "", host) or "localhost"
        return f"{proto}://{host}"

    def _authorized(self) -> bool:
        if not ADMIN_TOKEN:
            return True
        supplied = (
            self.headers.get("X-GPC-Token")
            or urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get("token", [""])[0]
        )
        return supplied == ADMIN_TOKEN

    def _serve_file(self, path: str, content_type: str, download: bool = False) -> None:
        try:
            size = os.path.getsize(path)
        except OSError:
            self._error(404, "文件不存在")
            return

        start, end = 0, size - 1
        status = 200
        rng = self.headers.get("Range")
        if rng:
            m = re.match(r"bytes=(\d*)-(\d*)", rng.strip())
            if m:
                first, last = m.group(1), m.group(2)
                if first:
                    # bytes=N-   从 N 取到末尾；bytes=N-M 取指定区间
                    start = int(first)
                    if last:
                        end = int(last)
                elif last:
                    # bytes=-N   取末尾 N 字节（此前误当作从头取 N，导致段错乱）
                    start = max(size - int(last), 0)
                    end = size - 1
                start = min(start, size - 1)
                end = min(end, size - 1)
                if start > end:
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{size}")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                status = 206

        length = end - start + 1
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(length))
        self.send_header("Accept-Ranges", "bytes")
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        if download:
            self.send_header("Content-Disposition", f'attachment; filename="{os.path.basename(path)}"')
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if self.command == "HEAD":
            return

        remaining = length
        with open(path, "rb") as fh:
            fh.seek(start)
            while remaining > 0:
                chunk = fh.read(min(262144, remaining))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    return
                remaining -= len(chunk)

    def _serve_index(self) -> None:
        index = os.path.join(WEBROOT, "index.html")
        if not os.path.isfile(index):
            self._error(500, "缺少 webroot/index.html")
            return
        self._serve_file(index, "text/html; charset=utf-8")

    # ---- 路由 ----
    def do_HEAD(self) -> None:  # noqa: N802
        self.do_GET()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        path = urllib.parse.unquote(parsed.path)
        query = urllib.parse.parse_qs(parsed.query)
        unique = (query.get("unique") or [""])[0]

        # DSM 套件来源握手
        if unique.startswith("synology_"):
            arch = (query.get("arch") or ["x86_64"])[0]
            self._json(dsm_payload(arch, self._origin()))
            return

        if path in ("/", "/index.html"):
            self._serve_index()
            return

        if path == "/api/packages":
            entries = []
            for e in all_entries():
                item = {k: v for k, v in e.items() if k != "path"}
                entries.append(item)
            self._json(
                {
                    "ok": True,
                    "packages": entries,
                    "capabilities": {
                        "upload": True,
                        "scan": bool(IMPORT_DIRS),
                        "scanDirs": IMPORT_DIRS,
                        "tokenRequired": bool(ADMIN_TOKEN),
                    },
                }
            )
            return

        if path == "/api/health":
            self._json({"ok": True, "packages": len(all_entries()), "data": DATA_DIR})
            return

        # 套件图标：DSM 套件中心按清单里的 thumbnail URL 拉取
        if path.startswith("/api/icon/"):
            name = os.path.basename(path)
            entry = next((e for e in all_entries() if e.get("file") == name), None)
            blob = spk_icon_bytes(entry) if entry else None
            if not blob:
                self._error(404, "没有图标")
                return
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(blob)))
            self.send_header("Cache-Control", "public, max-age=86400")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(blob)
            return

        if path.startswith("/api/packages/"):
            self._error(405, "请使用 DELETE 删除")
            return

        if path.startswith("/dsm/"):
            m = re.match(r"/dsm/synology-([a-z0-9_]+)\.json$", path)
            if not m:
                self._error(404, "清单不存在")
                return
            self._json(dsm_payload(m.group(1), self._origin()))
            return

        if path.startswith("/packages/"):
            name = os.path.basename(path)
            # 下载请求始终记一行，便于判断 DSM 是否真的回连、带了什么 Range。
            log("下载请求", self.command, name, "Range=", self.headers.get("Range"),
                "UA=", (self.headers.get("User-Agent") or "")[:80])
            entry = next((e for e in all_entries() if e.get("file") == name), None)
            if entry and os.path.isfile(entry.get("path") or ""):
                self._serve_file(entry["path"], "application/octet-stream", download=True)
                return
            builtin = os.path.join(BUILTIN_DIR, name)
            if os.path.isfile(builtin):
                self._serve_file(builtin, "application/octet-stream", download=True)
                return
            self._error(404, "安装包不存在")
            return

        # 静态文件（如有）
        safe = os.path.normpath(os.path.join(WEBROOT, path.lstrip("/")))
        if safe.startswith(WEBROOT) and os.path.isfile(safe):
            ctype = "application/octet-stream"
            if safe.endswith(".html"):
                ctype = "text/html; charset=utf-8"
            elif safe.endswith(".json"):
                ctype = "application/json; charset=utf-8"
            elif safe.endswith(".css"):
                ctype = "text/css; charset=utf-8"
            elif safe.endswith(".js"):
                ctype = "text/javascript; charset=utf-8"
            self._serve_file(safe, ctype)
            return

        # SPA 回退
        self._serve_index()

    def do_POST(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path == "/api/upload":
            self._handle_upload(query)
            return
        if path == "/api/scan":
            if not self._authorized():
                self._error(403, "令牌无效")
                return
            added = scan_imports()
            self._json({"ok": True, "added": [{"file": e["file"], "name": e["name"]} for e in added]})
            return

        # 上线 / 下线：下线后不再出现在 DSM 套件来源清单里
        m = re.match(r"^/api/packages/(.+)/status$", path)
        if m:
            if not self._authorized():
                self._error(403, "令牌无效")
                return
            file_name = os.path.basename(urllib.parse.unquote(m.group(1)))
            try:
                length = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                length = 0
            raw = self.rfile.read(length) if length > 0 else b"{}"
            try:
                payload = json.loads(raw.decode("utf-8") or "{}")
            except Exception:  # noqa: BLE001
                self._error(400, "请求体不是合法 JSON")
                return
            online = payload.get("online")
            if not isinstance(online, bool):
                self._error(400, "需要 online 布尔值")
                return
            if set_online(file_name, online):
                self._json({"ok": True, "file": file_name, "online": online})
            else:
                self._error(404, "套件不存在")
            return

        self._error(404, "接口不存在")

    def do_DELETE(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if not parsed.path.startswith("/api/packages/"):
            self._error(404, "接口不存在")
            return
        if not self._authorized():
            self._error(403, "令牌无效")
            return
        name = os.path.basename(urllib.parse.unquote(parsed.path))
        if unregister(name):
            self._json({"ok": True, "removed": name})
        else:
            self._error(404, "只能删除本地上传或扫描到的套件")

    # ---- 上传 ----
    def _handle_upload(self, query: dict) -> None:
        if not self._authorized():
            self._error(403, "令牌无效")
            return
        raw_name = (query.get("name") or [""])[0]
        name = os.path.basename(raw_name.replace("\\", "/")).strip()
        if not name.lower().endswith(".spk"):
            self._error(400, "只接受 .spk 文件")
            return
        name = re.sub(r"[^0-9A-Za-z._\-\u4e00-\u9fa5]", "_", name)
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0:
            self._error(411, "缺少 Content-Length")
            return
        if length > MAX_UPLOAD_BYTES:
            self._error(413, f"超过单包上限 {MAX_UPLOAD_BYTES // (1024 * 1024)} MB")
            return

        os.makedirs(UPLOAD_DIR, exist_ok=True)
        tmp = os.path.join(UPLOAD_DIR, f".upload-{int(time.time() * 1000)}.part")
        remaining = length
        try:
            with open(tmp, "wb") as fh:
                while remaining > 0:
                    chunk = self.rfile.read(min(262144, remaining))
                    if not chunk:
                        break
                    fh.write(chunk)
                    remaining -= len(chunk)
            if remaining != 0:
                raise IOError("上传被中断")

            # 同名且内容不同 → 加序号，避免互相覆盖
            target = os.path.join(UPLOAD_DIR, name)
            if os.path.isfile(target) and md5_file(target) != md5_file(tmp):
                stem, ext = os.path.splitext(name)
                n = 2
                while os.path.isfile(os.path.join(UPLOAD_DIR, f"{stem}-{n}{ext}")):
                    n += 1
                name = f"{stem}-{n}{ext}"
                target = os.path.join(UPLOAD_DIR, name)

            os.replace(tmp, target)
            entry = build_entry(target, name, "upload")
            register(entry)
            log("上传收录", name, entry["v"], entry["size"])
            self._json({"ok": True, "package": {k: v for k, v in entry.items() if k != "path"}})
        except ValueError as exc:
            self._safe_remove(tmp)
            self._error(400, str(exc))
        except Exception as exc:  # noqa: BLE001
            self._safe_remove(tmp)
            log("上传失败", exc)
            self._error(500, f"上传失败：{exc}")

    @staticmethod
    def _safe_remove(path: str) -> None:
        try:
            os.remove(path)
        except OSError:
            pass

    def log_message(self, fmt: str, *args) -> None:
        if os.environ.get("GPC_VERBOSE"):
            log(self.address_string(), fmt % args)


# --------------------------------------------------------------------------- #
def main() -> int:
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    with _lock:
        _state["builtin"] = load_catalog()
        _state["runtime"] = load_registry()
        _state["offline"] = load_state()
        _state["ready"] = True

    # 清理指向已不存在文件的运行时条目
    with _lock:
        stale = [k for k, v in _state["runtime"].items() if not os.path.isfile(v.get("path") or "")]
        for k in stale:
            _state["runtime"].pop(k, None)

    # 清理被更高版本覆盖的扫描条目（只删登记，不动源文件）
    winners = {id(e) for e in dedupe(list(_state["builtin"]) + list(_state["runtime"].values()))}
    with _lock:
        covered = [
            k for k, v in _state["runtime"].items()
            if v.get("origin") == "scan" and id(v) not in winners
        ]
        for k in covered:
            _state["runtime"].pop(k, None)
    if stale or covered:
        save_registry()

    log(f"内置套件 {len(_state['builtin'])}，运行时套件 {len(_state['runtime'])}")
    if IMPORT_DIRS:
        added = scan_imports()
        log(f"自动扫描目录 {IMPORT_DIRS}，新收录 {len(added)}")
        if SCAN_INTERVAL > 0:
            threading.Thread(target=scan_loop, daemon=True).start()

    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    server.daemon_threads = True
    log(f"监听 0.0.0.0:{PORT} 数据目录 {DATA_DIR}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
