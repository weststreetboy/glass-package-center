#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成 DSM 套件中心可识别的协议清单（SSPKS / jdel-sspks 格式）。

DSM 在「套件中心 → 设置 → 套件来源 → 新增」时会向来源 URL 发送：
    GET /?unique=synology_<arch>_<model>&arch=<arch>&major=7&minor=x&build=x&language=chs
要求返回 {"packages":[...]} 的 JSON，否则报「无效的位置」。

本脚本从 src/packages.data.ts 读取套件，计算每个 SPK 的真实 MD5，
按架构生成三份清单，供 nginx 按 $arg_arch 分发：
    webroot/dsm/synology-noarch.json
    webroot/dsm/synology-x86_64.json
    webroot/dsm/synology-armv8.json

link 里使用占位符 __DSM_ORIGIN__，由 nginx 的 sub_filter 在响应时
替换为 $scheme://$http_host，从而无需写死 NAS 的 IP 或端口。

用法：
    python3 scripts/build-dsm-index.py
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_TS = os.path.join(ROOT, "src", "packages.data.ts")
PKG_DIR = os.path.join(ROOT, "webroot", "packages")
OUT_DIR = os.path.join(ROOT, "webroot", "dsm")
ORIGIN = "__DSM_ORIGIN__"

# 与 JsonOutput.php::packageToJson 的字段保持一致（beta 由 DSM7 忽略）
MAINTAINER = "weststreetboy"
MAINTAINER_URL = "https://github.com/weststreetboy/glass-package-center"
DISTRIBUTOR = MAINTAINER
DISTRIBUTOR_URL = MAINTAINER_URL
SUPPORT_URL = MAINTAINER_URL + "/issues"


def load_packages() -> list[dict]:
    if not os.path.isfile(DATA_TS):
        raise SystemExit(f"找不到数据文件: {DATA_TS}")
    text = open(DATA_TS, encoding="utf-8").read()
    out: list[dict] = []
    for line in text.splitlines():
        s = line.strip()
        if not s.startswith("{") or '"id"' not in s:
            continue
        s = s.rstrip(",")
        try:
            out.append(json.loads(s))
        except json.JSONDecodeError:
            continue
    if not out:
        raise SystemExit("未能从 packages.data.ts 解析出任何套件")
    return out


def md5_of(path: str) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def to_dsm_package(p: dict) -> dict | None:
    fname = p.get("file", "")
    path = os.path.join(PKG_DIR, fname)
    if not os.path.isfile(path):
        print(f"  [skip] 缺少 SPK 文件: {fname}", file=sys.stderr)
        return None
    size = os.path.getsize(path)
    return {
        "package": p.get("en") or p.get("id"),
        "version": p.get("v", "1.0.0"),
        "dname": p.get("name") or p.get("en"),
        "desc": p.get("desc") or p.get("long") or "",
        "price": 0,
        "download_count": 2026,
        "recent_download_count": 0,
        "link": f"{ORIGIN}/packages/{fname}",
        "size": size,
        "md5": md5_of(path),
        "thumbnail": [],
        "snapshot": [],
        "qinst": True,
        "qstart": True,
        "qupgrade": True,
        "depsers": None,
        "deppkgs": None,
        "conflictpkgs": None,
        "start": True,
        "maintainer": p.get("maintainer") or MAINTAINER,
        "maintainer_url": MAINTAINER_URL,
        "distributor": DISTRIBUTOR,
        "distributor_url": DISTRIBUTOR_URL,
        "support_url": SUPPORT_URL,
        "changelog": p.get("long") or "",
        "thirdparty": True,
        "category": 0,
        "subcategory": 0,
        "type": 0,
        "silent_install": False,
        "silent_uninstall": False,
        "silent_upgrade": False,
        "auto_upgrade_from": None,
    }


def main() -> int:
    packages = load_packages()
    os.makedirs(OUT_DIR, exist_ok=True)

    buckets = {
        "noarch": [],
        "x86_64": [],
        "armv8": [],
    }

    for p in packages:
        dsm_pkg = to_dsm_package(p)
        if dsm_pkg is None:
            continue
        arches = [a.strip().lower() for a in p.get("arch", [])] or ["noarch"]
        # noarch 包对所有架构可见
        if "noarch" in arches:
            for bucket in buckets.values():
                bucket.append(dsm_pkg)
        if "x86_64" in arches:
            buckets["x86_64"].append(dsm_pkg)
        if "armv8" in arches or "armv7" in arches:
            buckets["armv8"].append(dsm_pkg)

    # 按 package + version 去重，保持数据文件顺序
    for arch, items in buckets.items():
        seen: set[str] = set()
        uniq = []
        for item in items:
            key = f"{item['package']}|{item['version']}|{item['link']}"
            if key in seen:
                continue
            seen.add(key)
            uniq.append(item)
        out_path = os.path.join(OUT_DIR, f"synology-{arch}.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump({"packages": uniq}, f, ensure_ascii=False, separators=(",", ":"))
            f.write("\n")
        print(f"[ok] {os.path.relpath(out_path, ROOT)}  packages={len(uniq)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
