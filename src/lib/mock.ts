/**
 * 浏览器预览用的假后端。
 *
 * 只在 `npm run dev` 且不在 Tauri 里时启用，目的是能在浏览器里
 * 检查真实布局（尤其是表格列对齐）。生产构建不会包含这个文件。
 */

import { relativeText } from "./relative";

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

function fmtOffset(min: number): string {
  const sign = min >= 0 ? "+" : "-";
  const a = Math.abs(min);
  return `${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

function fmtTime(ms: number, offMin: number): string {
  const d = new Date(ms + offMin * 60000);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.` +
    `${pad(d.getUTCMilliseconds(), 3)}`
  );
}

function weekdayOf(ms: number, offMin: number): string {
  const d = new Date(ms + offMin * 60000);
  return WEEKDAYS[(d.getUTCDay() + 6) % 7];
}

const ZONES: [string, string, number][] = [
  ["本地", "Local", -new Date().getTimezoneOffset()],
  ["UTC", "UTC", 0],
  ["上海", "Asia/Shanghai", 480],
  ["东京", "Asia/Tokyo", 540],
  ["新加坡", "Asia/Singapore", 480],
  ["伦敦", "Europe/London", 0],
  ["柏林", "Europe/Berlin", 60],
  ["纽约", "America/New_York", -300],
  ["洛杉矶", "America/Los_Angeles", -480],
  ["悉尼", "Australia/Sydney", 660],
];

/** 与 Rust 侧 relative() 保持一致：刚刚 / N 秒前 / N 分钟后 … */
function mockRelative(ms: number): string {
  return relativeText(ms, Date.now());
}

function mockTs(input: string) {
  const s = input.trim();
  let ms: number | null = null;
  if (/^\d+$/.test(s)) {
    if (s.length >= 16) ms = Math.floor(Number(s) / 1e6);
    else if (s.length >= 13) ms = Number(s);
    else ms = Number(s) * 1000;
  } else if (s) {
    const t = Date.parse(s.replace(" ", "T"));
    if (!Number.isNaN(t)) ms = t;
  }
  if (ms === null || !Number.isFinite(ms)) {
    return { millis: null, units: [], reps: [], zones: [] };
  }
  const localOff = -new Date(ms).getTimezoneOffset();
  return {
    millis: ms,
    units: [
      { label: "秒 (s)", value: String(Math.floor(ms / 1000)) },
      { label: "毫秒 (ms)", value: String(ms) },
    ],
    reps: [
      { label: "UTC", value: fmtTime(ms, 0) },
      { label: "本地时间", value: fmtTime(ms, localOff) },
      { label: "ISO 8601", value: new Date(ms).toISOString() },
      { label: "RFC 3339", value: new Date(ms).toISOString() },
      { label: "相对现在", value: mockRelative(ms) },
    ],
    zones: ZONES.map(([name, id, off]) => ({
      name,
      id,
      offset: fmtOffset(off),
      datetime: fmtTime(ms as number, off),
      weekday: weekdayOf(ms as number, off),
    })),
  };
}

function fakeHex(len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += "0123456789abcdef"[(i * 7 + 3) % 16];
  return s;
}

function b64urlDecode(seg: string): string {
  const s = seg.replace(/-/g, "+").replace(/_/g, "/");
  const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
  return decodeURIComponent(
    atob(padded)
      .split("")
      .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
      .join(""),
  );
}

function simpleDiff(left: string, right: string) {
  const a = left.split("\n");
  const b = right.split("\n");
  const lines: {
    tag: string;
    old_no: number | null;
    new_no: number | null;
    text: string;
  }[] = [];
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const la = a[i];
    const lb = b[i];
    if (la === lb) {
      if (la !== undefined) {
        lines.push({ tag: "equal", old_no: i + 1, new_no: i + 1, text: la });
        unchanged++;
      }
    } else {
      if (la !== undefined) {
        lines.push({ tag: "delete", old_no: i + 1, new_no: null, text: la });
        removed++;
      }
      if (lb !== undefined) {
        lines.push({ tag: "insert", old_no: null, new_no: i + 1, text: lb });
        added++;
      }
    }
  }
  return { lines, summary: { added, removed, unchanged } };
}

/**
 * 极简 JS 缩进器，只在浏览器预览里近似展示排版。
 * 真格式化在 Rust 侧（dprint + swc），这里不追求语义准确。
 */
function simpleJsFormat(src: string, indent: number): string {
  const unit = " ".repeat(Math.min(Math.max(indent, 1), 8));
  let depth = 0;
  let out = "";
  let line = "";
  let i = 0;

  const emit = () => {
    const t = line.trim();
    if (t) out += unit.repeat(depth) + t + "\n";
    line = "";
  };

  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];

    // 行注释
    if (c === "/" && n === "/") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      line += src.slice(i, stop).trimEnd();
      emit();
      i = stop;
      continue;
    }
    // 块注释
    if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i);
      line += "/* ... */";
      emit();
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    // 字符串 / 模板：内容原样保留
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === c) break;
        j++;
      }
      line += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === "{") {
      line += " {";
      emit();
      depth++;
      i++;
      continue;
    }
    if (c === "}") {
      emit();
      depth = Math.max(0, depth - 1);
      line = "}";
      i++;
      while (i < src.length && /\s/.test(src[i])) i++;
      const after = src[i];
      if (after && "),;.".includes(after)) continue;
      if (/^(else|catch|finally)\b/.test(src.slice(i, i + 8))) {
        line += " ";
        continue;
      }
      emit();
      continue;
    }
    if (c === ";") {
      line += ";";
      emit();
      i++;
      continue;
    }
    if (c === "\n") {
      emit();
      i++;
      continue;
    }
    if (c === " " || c === "\t") {
      if (line && !line.endsWith(" ")) line += " ";
      i++;
      continue;
    }
    line += c;
    i++;
  }
  emit();
  return out.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function mockKv(input: string): { tree: string; json: string } {
  const s = input.trim();
  if (!s) throw new Error("没有内容可解析");
  const src = s.startsWith("{") ? s : `{${s}}`;
  let i = 0;
  const ws = () => {
    while (i < src.length && /\s/.test(src[i])) i++;
  };
  const parseObj = (): Record<string, unknown> => {
    i += 1;
    const o: Record<string, unknown> = {};
    for (;;) {
      ws();
      if (src[i] === "}") {
        i += 1;
        break;
      }
      if (i >= src.length) throw new Error("缺少右花括号 }");
      let key = "";
      while (i < src.length && !"=:,}".includes(src[i])) key += src[i++];
      if (src[i] === "=" || src[i] === ":") i += 1;
      o[key.trim().replace(/^["']|["']$/g, "")] = parseValue();
      ws();
      if (src[i] === ",") i += 1;
    }
    return o;
  };
  const parseValue = (): unknown => {
    ws();
    if (src[i] === "{") return parseObj();
    let w = "";
    while (i < src.length && src[i] !== "," && src[i] !== "}") w += src[i++];
    w = w.trim();
    if (w === "null") return null;
    if (w === "true") return true;
    if (w === "false") return false;
    // 超过 2^53 的整数转字符串，和 Rust 侧保持一致
    if (/^-?\d+$/.test(w) && !/^-?0\d/.test(w)) {
      const n = Number(w);
      return Number.isSafeInteger(n) ? n : w;
    }
    if (/^-?\d+\.\d+$/.test(w)) return Number(w);
    return w;
  };
  const v = parseValue();
  return { tree: renderTree(v, 0), json: JSON.stringify(v, null, 2) };
}

function renderTree(v: unknown, indent: number): string {
  const pad = "  ".repeat(indent);
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => {
        if (val && typeof val === "object") {
          const inner = Object.keys(val).length
            ? `${pad}${k} = {\n${renderTree(val, indent + 1)}${pad}}\n`
            : `${pad}${k} = {}\n`;
          return inner;
        }
        return `${pad}${k} = ${String(val)}\n`;
      })
      .join("");
  }
  return `${pad}${String(v)}\n`;
}

/** 字符串绝对偏移 → 1 基行列，和 Rust serde_json 的 line()/column() 对齐 */
function offsetToLineCol(text: string, offset: number) {
  const before = text.slice(0, offset);
  return { line: before.split("\n").length, column: offset - before.lastIndexOf("\n") };
}

/**
 * V8 有些 JSON.parse 错误只给 "Unexpected token ',' ... is not valid JSON"，
 * 既不带 position 也不带 line/column。这时用极简词法扫描找第一个明显非法的
 * token（缺值、尾逗号、未闭合），让浏览器预览也能定位。仅开发态兜底，
 * 生产环境的精确定位由 Rust serde_json 负责。
 */
function fallbackJsonErrorPos(text: string) {
  let inString = false;
  let escaped = false;
  let depth = 0;
  let prev = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      prev = c;
      continue;
    }
    if (/\s/.test(c)) continue;
    if ((c === "," || c === "}" || c === "]") && (prev === ":" || prev === ",")) {
      return offsetToLineCol(text, i);
    }
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") depth--;
    prev = c;
  }
  return inString || depth > 0
    ? offsetToLineCol(text, text.length)
    : { line: 1, column: 1 };
}

export function mockInvoke(cmd: string, a: Record<string, unknown>): unknown {
  const str = (k: string) => String(a[k] ?? "");

  switch (cmd) {
    case "convert_timestamp":
      return mockTs(str("input"));

    case "kv_to_json":
      return mockKv(str("input"));

    case "hash_text": {
      // 只保证长度正确，供浏览器里核对布局；真实算法在 Rust 侧
      const LEN: Record<string, number> = {
        md5: 32,
        sha1: 40,
        sha256: 64,
        sha512: 128,
        sm3: 64,
        fnv1a32: 8,
        fnv1a64: 16,
      };
      return (a.algos as string[]).map((algo) => {
        const h = fakeHex(LEN[algo] ?? 32);
        return { algo, output: a.upper ? h.toUpperCase() : h };
      });
    }

    case "hmac_text":
      return fakeHex(64);

    // 浏览器里没有 swc 解析器，用简版缩进器近似一下，只为看清排版
    case "js_format":
      return simpleJsFormat(str("text"), Number(a.indent ?? 2));

    case "base64_encode":
      return btoa(unescape(encodeURIComponent(str("text"))));
    case "base64_decode":
      try {
        return decodeURIComponent(escape(atob(str("text").replace(/\s/g, ""))));
      } catch {
        throw new Error("Base64 解码失败：输入不是合法的 Base64");
      }

    case "url_encode":
      return encodeURIComponent(str("text"));
    case "url_decode":
      try {
        return decodeURIComponent(str("text"));
      } catch {
        return str("text");
      }
    case "url_parse": {
      try {
        const u = new URL(str("text"));
        return {
          scheme: u.protocol.replace(":", ""),
          host: u.hostname,
          port: u.port,
          path: u.pathname,
          fragment: u.hash.replace("#", ""),
          query: [...u.searchParams.entries()],
          error: null,
        };
      } catch {
        return {
          scheme: "",
          host: "",
          port: "",
          path: "",
          fragment: "",
          query: [],
          error: "看不懂这个 URL",
        };
      }
    }

    case "jwt_decode": {
      const segs = str("token").trim().split(".");
      if (segs.length !== 3) {
        return {
          header: "",
          payload: "",
          signature: "",
          alg: "",
          error: `JWT 应该是 3 段，当前 ${segs.length} 段`,
        };
      }
      try {
        const header = JSON.stringify(JSON.parse(b64urlDecode(segs[0])), null, 2);
        const payload = JSON.stringify(JSON.parse(b64urlDecode(segs[1])), null, 2);
        return {
          header,
          payload,
          signature: segs[2],
          alg: JSON.parse(header).alg ?? "?",
          error: null,
        };
      } catch {
        return { header: "", payload: "", signature: "", alg: "", error: "解码失败" };
      }
    }

    case "gen_password": {
      const safe = a.avoidAmbiguous !== false;
      const lo = safe ? "abcdefghijkmnopqrstuvwxyz" : "abcdefghijklmnopqrstuvwxyz";
      const up = safe ? "ABCDEFGHJKLMNPQRSTUVWXYZ" : "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const di = safe ? "23456789" : "0123456789";
      let pool = "";
      if (a.lower) pool += lo;
      if (a.upper) pool += up;
      if (a.digits) pool += di;
      if (a.symbols) pool += "!@#$%^&*-_=+?";
      if (!pool) throw new Error("至少要选一类字符");
      const len = Math.min(Math.max(Number(a.length ?? 20), 4), 256);
      const n = Math.min(Math.max(Number(a.count ?? 3), 1), 50);
      return Array.from({ length: n }, () =>
        Array.from({ length: len }, () => pool[Math.floor(Math.random() * pool.length)]).join(""),
      );
    }

    case "gen_uuid": {
      const n = Number(a.count ?? 5);
      return Array.from({ length: n }, () =>
        a.v7 ? crypto.randomUUID() : crypto.randomUUID(),
      );
    }

    case "qr_svg": {
      const size = Number(a.size ?? 260);
      const cells = 25;
      const cell = size / cells;
      let rects = "";
      for (let y = 0; y < cells; y++) {
        for (let x = 0; x < cells; x++) {
          if ((x * 3 + y * 7 + x * y) % 5 < 2) {
            rects += `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}"/>`;
          }
        }
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="#fff"/><g fill="#111418">${rects}</g></svg>`;
    }

    case "json_format": {
      const text = str("text");
      try {
        const parsed = JSON.parse(text);
        // 和 Rust 侧 json::expand_value 保持一致：只展开本身是对象 / 数组的
        // 字符串，标量字符串（"123" "true" 等）保留。
        // 注意：这是浏览器预览用的假后端，走 JS 的 number，超过 2^53 的雪花 ID
        // 会丢精度；真实 Tauri 里是 Rust serde_json，按 i64 精确解析
        const expandValue = (v: unknown): unknown => {
          if (Array.isArray(v)) return v.map(expandValue);
          if (v && typeof v === "object") {
            const out: Record<string, unknown> = {};
            for (const k of Object.keys(v as Record<string, unknown>)) {
              out[k] = expandValue((v as Record<string, unknown>)[k]);
            }
            return out;
          }
          if (typeof v === "string") {
            try {
              const inner = JSON.parse(v);
              if (inner && typeof inner === "object") return expandValue(inner);
            } catch {
              /* 不是 JSON，保留原字符串 */
            }
          }
          return v;
        };
        const v = a.expandStrings ? expandValue(parsed) : parsed;
        return a.minify ? JSON.stringify(v) : JSON.stringify(v, null, Number(a.indent ?? 2));
      } catch (e) {
        // 和 Rust 侧 syntax_error 对齐：抛出的 message 是 {message,line,column}
        // 的 JSON 字符串，前端 normalizeError 会解析出来做错误位置高亮。
        const msg = (e as Error).message;
        const lc = /line (\d+) column (\d+)/.exec(msg);
        const pos = /position (\d+)/.exec(msg);
        const where = lc
          ? { line: Number(lc[1]), column: Number(lc[2]) }
          : pos
            ? offsetToLineCol(text, Number(pos[1]))
            : fallbackJsonErrorPos(text);
        throw new Error(JSON.stringify({ message: `JSON 语法错误：${msg}`, ...where }));
      }
    }

    case "sql_format":
      return str("text")
        .replace(/\s+/g, " ")
        .replace(/\b(select|from|where|and|or|order by|group by|limit|insert into|values|update|set|delete|join|left join|inner join|on)\b/gi, (m) =>
          a.upper ? m.toUpperCase() : m.toLowerCase(),
        )
        .replace(/\s+(from|where|order by|group by|limit|join|left join|inner join)\s+/gi, "\n$1 ")
        .trim();

    case "regex_test": {
      try {
        const flags =
          (a.ignoreCase ? "i" : "") + (a.multiLine ? "m" : "") + (a.dotAll ? "s" : "");
        const re = new RegExp(str("pattern"), flags + "g");
        const text = str("text");
        const matches: { start: number; end: number; text: string; groups: string[] }[] = [];
        let m: RegExpExecArray | null;
        let guard = 0;
        while ((m = re.exec(text)) !== null && guard++ < 2000) {
          matches.push({
            start: m.index,
            end: m.index + m[0].length,
            text: m[0],
            groups: m.slice(1).map((g) => g ?? ""),
          });
          if (m[0].length === 0) re.lastIndex++;
        }
        return { matches, error: null };
      } catch (e) {
        return { matches: [], error: `正则语法错误：${(e as Error).message}` };
      }
    }

    case "text_diff":
      return simpleDiff(str("left"), str("right"));

    case "text_stats": {
      const t = str("text");
      return {
        chars: [...t].length,
        chars_no_space: [...t].filter((c) => !/\s/.test(c)).length,
        words: t.split(/\s+/).filter(Boolean).length,
        lines: t ? t.split("\n").length : 0,
        bytes: new Blob([t]).size,
      };
    }

    case "text_transform": {
      const t = str("text");
      const op = str("op");
      const words = t
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .split(/[\s_\-.]+/)
        .filter(Boolean);
      switch (op) {
        case "upper":
          return t.toUpperCase();
        case "lower":
          return t.toLowerCase();
        case "title":
          return t.replace(/\b\w/g, (c) => c.toUpperCase());
        case "snake":
          return words.map((w) => w.toLowerCase()).join("_");
        case "kebab":
          return words.map((w) => w.toLowerCase()).join("-");
        case "camel":
          return words
            .map((w, i) =>
              i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase(),
            )
            .join("");
        case "pascal":
          return words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join("");
        case "trim":
          return t.trim();
        case "trim-lines":
          return t.split("\n").map((l) => l.trim()).join("\n");
        case "remove-empty":
          return t.split("\n").filter((l) => l.trim()).join("\n");
        case "dedup-lines":
          return [...new Set(t.split("\n"))].join("\n");
        case "sort-lines":
          return t.split("\n").sort().join("\n");
        case "sort-lines-desc":
          return t.split("\n").sort().reverse().join("\n");
        case "reverse-lines":
          return t.split("\n").reverse().join("\n");
        case "reverse":
          return [...t].reverse().join("");
        default:
          return t;
      }
    }

    case "color_parse": {
      const s = str("input").trim();
      const m = s.match(/^#?([0-9a-f]{3,8})$/i);
      if (!m) return { hex: "", hex8: "", rgb: "", hsl: "", r: 0, g: 0, b: 0, a: 255, error: "看不懂这个颜色值" };
      let h = m[1];
      if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
      if (h.length !== 6 && h.length !== 8) return { hex: "", hex8: "", rgb: "", hsl: "", r: 0, g: 0, b: 0, a: 255, error: "看不懂这个颜色值" };
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      const al = h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255;
      const rf = r / 255;
      const gf = g / 255;
      const bf = b / 255;
      const max = Math.max(rf, gf, bf);
      const min = Math.min(rf, gf, bf);
      const l = (max + min) / 2;
      let hue = 0;
      let sat = 0;
      if (max !== min) {
        const d = max - min;
        sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        hue =
          max === rf
            ? ((gf - bf) / d + (gf < bf ? 6 : 0)) * 60
            : max === gf
              ? ((bf - rf) / d + 2) * 60
              : ((rf - gf) / d + 4) * 60;
      }
      const hx = (n: number) => n.toString(16).padStart(2, "0");
      return {
        hex: `#${hx(r)}${hx(g)}${hx(b)}`,
        hex8: `#${hx(r)}${hx(g)}${hx(b)}${hx(al)}`,
        rgb: al === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(al / 255).toFixed(2)})`,
        // sat / l 在算法里是 0~1 的小数，输出成百分比要乘 100（漏乘会得到 hsl(32, 1%, 1%)）
        hsl: `hsl(${hue.toFixed(0)}, ${(sat * 100).toFixed(0)}%, ${(l * 100).toFixed(0)}%)`,
        r,
        g,
        b,
        a: al,
        error: null,
      };
    }

    case "contrast_ratio":
      return 4.72;

    case "json_size":
      return str("text").length;

    default:
      return null;
  }
}
