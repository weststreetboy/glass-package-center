// 浏览器端 SPK 打包器：结构与 sspks-imnks/_local/build_spk.py 保持一致。
// 不依赖后端与第三方库，用 USTAR tar + stored-block gzip + MD5 生成 DSM 7 可识别的 .spk。

const enc = new TextEncoder();

export type StudioFile = { path: string; data: Uint8Array; size: number };
export type StudioIcons = { i64: Uint8Array; i256: Uint8Array };
export type StudioConfig = {
  name: string;
  displayname: string;
  version: string;
  arch: string;
  archList: string;
  osMinVer: string;
  maintainer: string;
  distributor: string;
  supportUrl: string;
  description: string;
  startable: boolean;
  adminPort: string;
  adminProtocol: string;
  licenseText: string;
  forceExec: boolean;
};

type TarEntry = {
  name: string;
  data: Uint8Array;
  mode: number;
  isDir?: boolean;
};

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function octalField(value: number, width: number): Uint8Array {
  return enc.encode(value.toString(8).padStart(width - 1, "0") + "\0");
}

function tarHeader(name: string, size: number, mode: number, isDir: boolean): Uint8Array {
  const h = new Uint8Array(512);
  const put = (offset: number, bytes: Uint8Array) =>
    h.set(bytes.subarray(0, 512 - offset), offset);

  let fname = name;
  let prefix = "";
  if (name.length > 100) {
    let cut = -1;
    for (let i = 0; i < name.length; i++) {
      if (name[i] === "/" && i <= 155 && name.length - i - 1 <= 100) cut = i;
    }
    if (cut >= 0) {
      prefix = name.slice(0, cut);
      fname = name.slice(cut + 1);
    } else {
      fname = name.slice(-100);
    }
  }

  put(0, enc.encode(fname));
  put(100, octalField(mode, 8));
  put(108, octalField(0, 8));
  put(116, octalField(0, 8));
  put(124, octalField(size, 12));
  put(136, octalField(0, 12));
  h.fill(0x20, 148, 156);
  h[156] = isDir ? 0x35 : 0x30;
  put(257, enc.encode("ustar\0"));
  put(263, enc.encode("00"));
  put(265, enc.encode("root"));
  put(297, enc.encode("root"));
  if (prefix) put(345, enc.encode(prefix));

  let sum = 0;
  for (let i = 0; i < 512; i++) sum += h[i];
  put(148, enc.encode(sum.toString(8).padStart(6, "0") + "\0 "));
  return h;
}

function createTar(entries: TarEntry[]): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const e of entries) {
    const dir = !!e.isDir;
    const name = dir && !e.name.endsWith("/") ? `${e.name}/` : e.name;
    parts.push(tarHeader(name, dir ? 0 : e.data.length, e.mode, dir));
    if (!dir && e.data.length) {
      parts.push(e.data);
      const pad = (512 - (e.data.length % 512)) % 512;
      if (pad) parts.push(new Uint8Array(pad));
    }
  }
  parts.push(new Uint8Array(1024));
  return concat(parts);
}

function crc32(data: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

// gzip 的 stored deflate 块：不压缩但完全合法，避免依赖 CompressionStream。
function gzipStored(data: Uint8Array): Uint8Array {
  const out: number[] = [0x1f, 0x8b, 0x08, 0, 0, 0, 0, 0, 0, 0x03];
  const chunkSize = 65535;
  for (let off = 0; off < data.length || data.length === 0; off += chunkSize) {
    const chunk = data.subarray(off, Math.min(off + chunkSize, data.length));
    const last = off + chunkSize >= data.length;
    out.push(last ? 1 : 0, chunk.length & 255, (chunk.length >> 8) & 255);
    out.push((~chunk.length) & 255, ((~chunk.length) >> 8) & 255);
    for (const b of chunk) out.push(b);
    if (data.length === 0) break;
  }
  const crc = crc32(data);
  for (let i = 0; i < 4; i++) out.push((crc >>> (8 * i)) & 255);
  for (let i = 0; i < 4; i++) out.push((data.length >>> (8 * i)) & 255);
  return new Uint8Array(out);
}

function md5(bytes: Uint8Array): string {
  const S = new Uint32Array([
    7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21,
  ]);
  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i++)
    K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const bitLen = bytes.length * 8;
  const size = ((bytes.length + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(size);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(size - 8, bitLen >>> 0, true);
  dv.setUint32(size - 4, Math.floor(bitLen / 4294967296) >>> 0, true);

  for (let off = 0; off < size; off += 64) {
    const M = new Uint32Array(16);
    for (let j = 0; j < 16; j++) M[j] = dv.getUint32(off + j * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let f: number, g: number;
      if (i < 16) { f = (B & C) | (~B & D); g = i; }
      else if (i < 32) { f = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { f = C ^ (B | ~D); g = (7 * i) % 16; }
      f = (f + A + K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      const sh = S[(i >> 4) * 4 + (i & 3)];
      B = (B + ((f << sh) | (f >>> (32 - sh)))) >>> 0;
    }
    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }
  const out = new Uint8Array(16);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, a0, true);
  odv.setUint32(4, b0, true);
  odv.setUint32(8, c0, true);
  odv.setUint32(12, d0, true);
  return Array.from(out).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const q = (v: string) => `"${String(v ?? "").replace(/"/g, "'")}"`;

export function makeInfo(c: StudioConfig, checksum: string): string {
  const lines = [
    `package=${q(c.name)}`,
    `version=${q(c.version)}`,
    `displayname=${q(c.displayname || c.name)}`,
    `description=${q(c.description || "Minimal DSM 7 package built in browser.")}`,
    `arch=${q(c.archList || c.arch)}`,
    `os_min_ver=${q(c.osMinVer)}`,
    `maintainer=${q(c.maintainer)}`,
    `distributor=${q(c.distributor)}`,
  ];
  if (c.supportUrl) lines.push(`support_url=${q(c.supportUrl)}`);
  lines.push(
    'thirdparty="yes"',
    `checksum="${checksum}"`,
    'silent_install="yes"',
    'silent_uninstall="yes"',
    'silent_upgrade="yes"',
  );
  if (c.startable) lines.push('startable="yes"');
  if (c.adminPort) {
    lines.push(`adminport=${q(c.adminPort)}`);
    lines.push(`adminprotocol=${q(c.adminProtocol || "http")}`);
  }
  return lines.join("\n") + "\n";
}

const TEXT_EXT = /\.(sh|js|json|py|conf|ini|txt|xml|css|html|service)$/i;

function payloadBytes(f: StudioFile, forceExec: boolean): Uint8Array {
  let data = f.data;
  if (TEXT_EXT.test(f.path)) {
    const s = new TextDecoder().decode(data);
    if (s.includes("\r\n")) data = enc.encode(s.replace(/\r\n/g, "\n"));
  }
  const exec = forceExec && (f.path.endsWith(".sh") || f.path.startsWith("scripts/"));
  return data;
}

export async function readPayloadFiles(files: File[]): Promise<StudioFile[]> {
  const list = await Promise.all(
    files.map(async (f) => {
      let path = ((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name)
        .replace(/\\/g, "/")
        .replace(/^\/+/, "");
      return {
        path,
        data: new Uint8Array(await f.arrayBuffer()),
        size: f.size,
      };
    }),
  );
  const segs = list.map((x) => x.path.split("/"));
  if (
    list.length > 1 &&
    segs.every((s) => s.length >= 2 && s[0] === segs[0][0])
  ) {
    list.forEach((x, i) => (x.path = segs[i].slice(1).join("/")));
  }
  return list;
}

export async function iconFromImage(file: File): Promise<StudioIcons> {
  const bmp = await createImageBitmap(file);
  const draw = (size: number) => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = size;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    const scale = Math.min(size / bmp.width, size / bmp.height);
    const w = bmp.width * scale;
    const h = bmp.height * scale;
    ctx.drawImage(bmp, (size - w) / 2, (size - h) / 2, w, h);
    return cv;
  };
  const png = (cv: HTMLCanvasElement) =>
    new Promise<Uint8Array>((resolve, reject) =>
      cv.toBlob((b) =>
        b
          ? b.arrayBuffer().then((x) => resolve(new Uint8Array(x)))
          : reject(new Error("图标转换失败")), "image/png"),
    );
  return { i64: await png(draw(64)), i256: await png(draw(256)) };
}

export function placeholderIcon(size: number): Uint8Array {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, "#5b8cff");
  g.addColorStop(1, "#a56bff");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${Math.round(size * 0.42)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("SPK", size / 2, size / 2);
  const base64 = cv.toDataURL("image/png").split(",")[1];
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function buildSpk(
  c: StudioConfig,
  files: StudioFile[],
  icons: StudioIcons,
): { blob: Blob; filename: string; checksum: string; info: string; tgzBytes: number; spkBytes: number } {
  const payloadEntries: TarEntry[] = files.map((f) => ({
    name: f.path,
    data: payloadBytes(f, c.forceExec),
    mode:
      c.forceExec && (f.path.endsWith(".sh") || f.path.startsWith("scripts/"))
        ? 0o755
        : 0o644,
  }));
  const tgz = gzipStored(createTar(payloadEntries));
  const checksum = md5(tgz);
  const info = makeInfo(c, checksum);
  const entries: TarEntry[] = [
    { name: "scripts/", data: new Uint8Array(0), mode: 0o755, isDir: true },
    { name: "conf/", data: new Uint8Array(0), mode: 0o755, isDir: true },
    { name: "INFO", data: enc.encode(info), mode: 0o644 },
    { name: "package.tgz", data: tgz, mode: 0o644 },
    { name: "LICENSE", data: enc.encode(c.licenseText.trim() || "MIT License. Demo package only.\n"), mode: 0o644 },
    { name: "PACKAGE_ICON.PNG", data: icons.i64, mode: 0o644 },
    { name: "PACKAGE_ICON_256.PNG", data: icons.i256, mode: 0o644 },
    { name: "conf/privilege", data: enc.encode('{"defaults":{"run-as":"package"}}\n'), mode: 0o644 },
  ];
  const spk = createTar(entries);
  const blob = new Blob([spk.slice().buffer as ArrayBuffer], {
    type: "application/vnd.synology-package",
  });
  const filename = `${c.name}_${c.arch}-${c.osMinVer.split("-")[0]}_${c.version}.spk`;
  return { blob, filename, checksum, info, tgzBytes: tgz.length, spkBytes: spk.length };
}
