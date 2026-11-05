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

/** 与 Rust 侧一致：把顶层换行当字段分隔符，引号内的换行保留 */
function normalizeKvNewlines(input: string): string {
  let out = "";
  let quote: string | null = null;
  let escaped = false;
  for (const c of input) {
    if (quote) {
      out += c;
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      out += c;
    } else if (c === "\n" || c === "\r") {
      const t = out.trimEnd();
      if (!t.endsWith(",") && !t.endsWith("{")) out += ",";
    } else {
      out += c;
    }
  }
  return out;
}

function mockKv(input: string): { tree: string; json: string } {
  const s = input.trim();
  if (!s) throw new Error("没有内容可解析");
  const src = normalizeKvNewlines(s.startsWith("{") ? s : `{${s}}`);
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

    case "base64_encode": {
      const b64 = btoa(unescape(encodeURIComponent(str("text"))));
      let out = a.urlSafe ? b64.replace(/\+/g, "-").replace(/\//g, "_") : b64;
      if (a.noPad) out = out.replace(/=+$/, "");
      return out;
    }
    case "base64_decode":
      try {
        let s = str("text").replace(/\s/g, "");
        if (a.urlSafe) s = s.replace(/-/g, "+").replace(/_/g, "/");
        s = s.padEnd(Math.ceil(s.length / 4) * 4, "=");
        return decodeURIComponent(escape(atob(s)));
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

    // 以下为新增菜单的浏览器预览实现；真实算法与校验都在 Rust 侧
    case "text_format":
      return mockTextFormat(str("kind"), str("text"), Number(a.indent ?? 2));

    case "url_params_format":
      return mockUrlParams(str("text"), Boolean(a.sort));

    case "radix_convert":
      return mockRadix(str("value"), Number(a.from ?? 10));

    case "json_to_yaml":
      return mockJsonToYaml(str("text"));

    case "yaml_to_json":
      throw new Error("浏览器预览不支持 YAML 解析，请使用桌面应用");

    case "json_to_xml":
      return mockJsonToXml(str("text"), Number(a.indent ?? 2));

    case "xml_to_json":
      return mockXmlToJson(str("text"));

    case "unicode_escape":
      return mockUnicodeEscape(str("text"));

    case "unicode_unescape":
      return mockUnicodeUnescape(str("text"));

    case "rmb_to_upper":
      return mockRmbUpper(str("amount"));

    case "rmb_from_upper":
      return mockRmbFromUpper(str("text"));

    case "cron_explain":
      return mockCronExplain(str("expr"));

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// 浏览器预览用的轻量实现（只求布局和交互可验证，不替代 Rust 业务逻辑）
// ---------------------------------------------------------------------------

function mockTextFormat(kind: string, text: string, indent: number): string {
  const pad = " ".repeat(Math.max(1, Math.min(8, indent)));
  const src = text.trim();
  if (!src) return "";
  if (kind === "markdown") {
    const lines = src.replace(/\r\n?/g, "\n").split("\n");
    const out: string[] = [];
    let blank = 0;
    for (const line of lines) {
      const t = line.replace(/\s+$/, "");
      if (!t) {
        if (++blank <= 1) out.push("");
        continue;
      }
      blank = 0;
      out.push(t.replace(/^(#{1,6})([^\s#])/, "$1 $2"));
    }
    return out.join("\n").replace(/\n+$/, "") + "\n";
  }
  if (kind === "css" || kind === "scss") {
    const oneLine = src
      .replace(/\s+/g, " ")
      .replace(/\s*{\s*/g, " {\n")
      .replace(/;\s*/g, ";\n")
      .replace(/\s*}\s*/g, "\n}\n");
    let depth = 0;
    return oneLine
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        if (l.startsWith("}")) depth = Math.max(0, depth - 1);
        const v = pad.repeat(depth) + l;
        if (l.endsWith("{")) depth++;
        return v;
      })
      .join("\n");
  }
  if (kind === "xml" || kind === "html") {
    const withBreaks = src
      .replace(/>\s*</g, ">\n<")
      .replace(/\s+/g, " ");
    let depth = 0;
    const voids = new Set([
      "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
      "param", "source", "track", "wbr",
    ]);
    return withBreaks
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const closing = /^<\//.test(l);
        const self = /\/>$/.test(l) || /^<(!|\?)/.test(l);
        const name = l.replace(/^<\/?/, "").split(/[\s>/]/)[0].toLowerCase();
        if (closing) depth = Math.max(0, depth - 1);
        const v = pad.repeat(depth) + l;
        if (!closing && !self && !(kind === "html" && voids.has(name))) depth++;
        return v;
      })
      .join("\n");
  }
  if (kind === "yaml") {
    throw new Error("浏览器预览不支持 YAML 格式化，请使用桌面应用");
  }
  throw new Error(`不支持的格式：${kind}`);
}

function mockUrlParams(text: string, sort: boolean): string {
  let s = text.trim().split("#")[0];
  const q = s.indexOf("?");
  if (q >= 0) s = s.slice(q + 1);
  s = s.replace(/^\?/, "");
  if (!s) return "";
  const params = s
    .split("&")
    .filter(Boolean)
    .map((pair) => {
      const [k, v = ""] = pair.split("=");
      const dec = (x: string) => {
        try {
          return decodeURIComponent(x.replace(/\+/g, " "));
        } catch {
          return x;
        }
      };
      return [dec(k), dec(v)] as [string, string];
    });
  if (sort) params.sort((x, y) => x[0].localeCompare(y[0]));
  const width = Math.max(...params.map((p) => [...p[0]].length));
  return params
    .map(([k, v]) => k + " ".repeat(width - [...k].length) + " = " + v)
    .join("\n");
}

function mockRadix(value: string, from: number): Record<string, string> {
  if (![2, 8, 10, 16].includes(from)) throw new Error("来源进制只能是 2 / 8 / 10 / 16");
  let s = value.trim();
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  const lower = s.toLowerCase();
  if (from === 2 && lower.startsWith("0b")) s = s.slice(2);
  if (from === 8 && lower.startsWith("0o")) s = s.slice(2);
  if (from === 16 && lower.startsWith("0x")) s = s.slice(2);
  if (!s) throw new Error("请输入要转换的数字");
  const digits = "0123456789abcdef".slice(0, from);
  const bad = [...s.toLowerCase()].find((c) => !digits.includes(c));
  if (bad) throw new Error("输入包含当前进制不允许的字符");
  let n = 0n;
  for (const c of s.toLowerCase()) n = n * BigInt(from) + BigInt(digits.indexOf(c));
  if (neg) n = -n;
  const abs = n < 0n ? -n : n;
  const sign = n < 0n ? "-" : "";
  return {
    decimal: n.toString(),
    binary: `${sign}0b${abs.toString(2)}`,
    octal: `${sign}0o${abs.toString(8)}`,
    hex: `${sign}0x${abs.toString(16)}`,
  };
}

function mockJsonToYaml(text: string): string {
  const v = JSON.parse(text);
  const scalar = (x: unknown): string => {
    if (x === null) return "null";
    if (typeof x === "string") {
      return /[:#\-\n]/.test(x) || x === "" ? JSON.stringify(x) : x;
    }
    return String(x);
  };
  const dump = (x: unknown, depth: number): string => {
    const pad = "  ".repeat(depth);
    if (Array.isArray(x)) {
      if (!x.length) return " []";
      return (
        "\n" +
        x
          .map((item) =>
            `${pad}- ${
              item && typeof item === "object"
                ? dump(item, 0).replace(/^\n?/, "").trimStart()
                : scalar(item)
            }`,
          )
          .join("\n")
      );
    }
    if (x && typeof x === "object") {
      const keys = Object.keys(x as Record<string, unknown>);
      if (!keys.length) return " {}";
      return (
        "\n" +
        keys
          .map((k) => {
            const val = (x as Record<string, unknown>)[k];
            if (val && typeof val === "object") {
              return `${pad}${k}:${dump(val, depth + 1)}`;
            }
            return `${pad}${k}: ${scalar(val)}`;
          })
          .join("\n")
      );
    }
    return " " + scalar(x);
  };
  return (dump(v, 0).trimStart() || "null") + "\n";
}

function mockJsonToXml(text: string, indent: number): string {
  const v = JSON.parse(text);
  const pad = " ".repeat(indent);
  const esc = (s: string, attr = false) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(attr ? /"/g : /$^/, "&quot;")
      .replace(attr ? /'/g : /$^/, "&apos;");
  const nameOk = (n: string) => /^[A-Za-z_:][\w.:-]*$/.test(n);
  const scalar = (x: unknown) =>
    x === null ? "" : typeof x === "string" ? x : String(x);
  const write = (name: string, x: unknown, depth: number): string => {
    if (!nameOk(name)) throw new Error(`键「${name}」不是合法的 XML 标签名`);
    const p = pad.repeat(depth);
    if (Array.isArray(x)) {
      if (!x.length) return `${p}<${name}/>`;
      return x.map((it) => write(name, it, depth)).join("\n");
    }
    if (x && typeof x === "object") {
      const attrs: string[] = [];
      let textNode: string | undefined;
      const children: [string, unknown][] = [];
      for (const [k, val] of Object.entries(x as Record<string, unknown>)) {
        if (k.startsWith("@")) attrs.push(` ${k.slice(1)}="${esc(scalar(val), true)}"`);
        else if (k === "#text") textNode = scalar(val);
        else children.push([k, val]);
      }
      if (!children.length) {
        const body = textNode ?? "";
        return body
          ? `${p}<${name}${attrs.join("")}>${esc(body)}</${name}>`
          : `${p}<${name}${attrs.join("")}/>`;
      }
      const lines = [`${p}<${name}${attrs.join("")}>`];
      if (textNode) lines.push(`${p}${pad}${esc(textNode)}`);
      for (const [k, val] of children) lines.push(write(k, val, depth + 1));
      lines.push(`${p}</${name}>`);
      return lines.join("\n");
    }
    return `${p}<${name}>${esc(scalar(x))}</${name}>`;
  };
  if (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 1) {
    const [k, val] = Object.entries(v as Record<string, unknown>)[0];
    return write(k, val, 0);
  }
  if (Array.isArray(v)) return v.map((it) => write("item", it, 0)).join("\n");
  return write("root", v, 0);
}

function mockXmlToJson(text: string): string {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("XML 解析失败，请检查标签闭合");
  const root = doc.documentElement;
  const toJson = (el: Element): unknown => {
    const attrs = [...el.attributes];
    const children = [...el.children];
    const textValue = [...el.childNodes]
      .filter((n) => n.nodeType === 3 || n.nodeType === 4)
      .map((n) => n.nodeValue ?? "")
      .join("")
      .trim();
    if (!attrs.length && !children.length) return textValue;
    const obj: Record<string, unknown> = {};
    for (const at of attrs) obj[`@${at.name}`] = at.value;
    if (textValue) obj["#text"] = textValue;
    for (const child of children) {
      const val = toJson(child);
      if (child.tagName in obj) {
        const old = obj[child.tagName];
        obj[child.tagName] = Array.isArray(old) ? [...old, val] : [old, val];
      } else {
        obj[child.tagName] = val;
      }
    }
    return obj;
  };
  return JSON.stringify(toJson(root), null, 2);
}

function mockUnicodeEscape(text: string): string {
  const hex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, "0");
  let out = "";
  for (const c of text) {
    const cp = c.codePointAt(0) ?? 0;
    if (cp <= 0x7f) out += c;
    else if (cp <= 0xffff) out += `\\u${hex4(cp)}`;
    else {
      const v = cp - 0x10000;
      out += `\\u${hex4(0xd800 + (v >> 10))}\\u${hex4(0xdc00 + (v & 0x3ff))}`;
    }
  }
  return out;
}

function mockUnicodeUnescape(text: string): string {
  return text.replace(/\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})/g, (m: string, braced: string | undefined, four: string | undefined) => {
    const cp = Number.parseInt(braced ?? four ?? "", 16);
    if (cp >= 0xd800 && cp <= 0xdbff) return m;
    try {
      return String.fromCodePoint(cp);
    } catch {
      return m;
    }
  }).replace(/([\ud800-\udbff])([\udc00-\udfff])/g, (_: string, hi: string, lo: string) =>
    String.fromCodePoint(0x10000 + ((hi.charCodeAt(0) - 0xd800) << 10) + (lo.charCodeAt(0) - 0xdc00)),
  );
}

const MOCK_RMB_DIGITS = ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"];
const MOCK_RMB_UNITS = ["", "拾", "佰", "仟"];
const MOCK_RMB_GROUPS = ["", "万", "亿"];

function mockRmbGroup(n: number): string {
  let out = "";
  let zero = false;
  for (let pos = 3; pos >= 0; pos--) {
    const d = Math.floor(n / 10 ** pos) % 10;
    if (d === 0) {
      if (out) zero = true;
    } else {
      if (zero) {
        out += "零";
        zero = false;
      }
      out += MOCK_RMB_DIGITS[d] + MOCK_RMB_UNITS[pos];
    }
  }
  return out;
}

function mockRmbInteger(n: number): string {
  if (n === 0) return "零";
  const groups = [n % 10000, Math.floor((n / 10000) % 10000), Math.floor((n / 1e8) % 10000)];
  let out = "";
  let pending = false;
  for (let idx = 2; idx >= 0; idx--) {
    const g = groups[idx];
    if (!g) {
      if (out) pending = true;
      continue;
    }
    if (out && (pending || g < 1000) && !out.endsWith("零")) out += "零";
    out += mockRmbGroup(g) + MOCK_RMB_GROUPS[idx];
    pending = false;
  }
  return out;
}

function mockRmbUpper(amount: string): string {
  const t = amount
    .trim()
    .replace(/^[¥￥]/, "")
    .replace(/[,，\s]/g, "");
  if (!t) throw new Error("请输入金额");
  if (t.startsWith("-")) throw new Error("金额不能为负数");
  const parts = t.split(".");
  if (parts.length > 2) throw new Error("小数点只能出现一次");
  const [intRaw, frac = ""] = parts;
  if (intRaw && !/^\d+$/.test(intRaw)) throw new Error("整数部分只能是数字");
  if (frac && !/^\d+$/.test(frac)) throw new Error("小数部分只能是数字");
  if (frac.length > 2) throw new Error("金额最多保留两位小数（角、分）");
  const intTrim = intRaw.replace(/^0+/, "");
  if (intTrim.length > 12) throw new Error("金额超出支持范围（最大 9999 亿）");
  const major = Number(intTrim || "0");
  const jiao = Number(frac[0] ?? "0");
  const fen = Number(frac[1] ?? "0");
  let out = `${mockRmbInteger(major)}元`;
  if (!jiao && !fen) out += "整";
  else if (!jiao) out += `零${MOCK_RMB_DIGITS[fen]}分`;
  else {
    out += `${MOCK_RMB_DIGITS[jiao]}角`;
    out += fen ? `${MOCK_RMB_DIGITS[fen]}分` : "整";
  }
  return out;
}

function mockRmbDigit(c: string): number | null {
  const i = MOCK_RMB_DIGITS.indexOf(c);
  if (i >= 0) return i;
  const simple = "零一二三四五六七八九";
  const j = simple.indexOf(c);
  return j >= 0 ? j : null;
}

function mockRmbSection(s: string): number {
  let total = 0;
  let current = 0;
  let hasDigit = false;
  let lastUnit = 10000;
  for (const c of s) {
    if (c === "零") {
      current = 0;
      hasDigit = false;
      continue;
    }
    const d = mockRmbDigit(c);
    if (d !== null) {
      if (hasDigit) throw new Error("数位之间缺少单位");
      current = d;
      hasDigit = true;
      continue;
    }
    const unit = c === "拾" || c === "十" ? 10 : c === "佰" || c === "百" ? 100 : c === "仟" || c === "千" ? 1000 : 0;
    if (!unit) throw new Error(`无法识别「${c}」`);
    if (unit >= lastUnit) throw new Error("单位顺序不正确");
    total += (hasDigit ? current : 1) * unit;
    current = 0;
    hasDigit = false;
    lastUnit = unit;
  }
  return total + current;
}

function mockRmbInt(s: string): number {
  if (!s) return 0;
  const yi = s.indexOf("亿");
  if (yi >= 0) return mockRmbInt(s.slice(0, yi)) * 1e8 + mockRmbInt(s.slice(yi + 1));
  const wan = s.indexOf("万");
  if (wan >= 0) return mockRmbInt(s.slice(0, wan)) * 1e4 + mockRmbInt(s.slice(wan + 1));
  return mockRmbSection(s);
}

function mockRmbFromUpper(text: string): string {
  const cleaned = text.trim().replace(/[,，\s]/g, "");
  if (!cleaned) throw new Error("请输入中文大写金额");
  if (cleaned.startsWith("负")) throw new Error("金额不能为负数");
  const normalized = cleaned.replace(/圆/g, "元").replace(/正/g, "整").replace(/整+$/, "");
  const idx = normalized.indexOf("元");
  const intPart = idx >= 0 ? normalized.slice(0, idx) : "";
  const decPart = idx >= 0 ? normalized.slice(idx + 1) : normalized;
  const major = intPart ? mockRmbInt(intPart) : 0;
  if (major > 999999999999) throw new Error("金额超出支持范围（最大 9999 亿）");
  let jiao = 0;
  let fen = 0;
  let current: number | null = null;
  for (const c of decPart) {
    if (c === "零") {
      current = null;
      continue;
    }
    const d = mockRmbDigit(c);
    if (d !== null) {
      if (current !== null) throw new Error("角分数字重复");
      current = d;
      continue;
    }
    if (c === "角") {
      jiao = current ?? 0;
      current = null;
    } else if (c === "分") {
      fen = current ?? 0;
      current = null;
    } else {
      throw new Error(`无法识别「${c}」`);
    }
  }
  if (current !== null) throw new Error("角分缺少单位");
  return jiao || fen ? `${major}.${jiao}${fen}` : String(major);
}

const MOCK_CRON_NAMES: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
};

function mockCronField(
  token: string,
  min: number,
  max: number,
  label: string,
  allowSeven = false,
): Set<number> {
  const out = new Set<number>();
  const limit = allowSeven ? 7 : max;
  for (const rawItem of token.split(",")) {
    if (!rawItem.trim()) throw new Error(`${label}字段的列表里有空项`);
    const [base, stepRaw] = rawItem.split("/");
    let step = 1;
    if (stepRaw !== undefined) {
      if (!/^\d+$/.test(stepRaw) || Number(stepRaw) === 0) throw new Error(`${label}字段的步长必须大于 0`);
      step = Number(stepRaw);
    }
    const parse = (x: string) => {
      if (/^\d+$/.test(x.trim())) return Number(x);
      const n = MOCK_CRON_NAMES[x.trim().toUpperCase()];
      if (n === undefined) throw new Error(`${label}字段无法识别「${x}」`);
      return n;
    };
    let start: number;
    let end: number;
    if (base === "*") {
      start = min;
      end = max;
    } else if (base.includes("-")) {
      const [a, b] = base.split("-");
      start = parse(a);
      end = parse(b);
      if (start > end) throw new Error(`${label}字段的范围起点大于终点`);
    } else {
      start = parse(base);
      end = stepRaw !== undefined ? limit : start;
    }
    if (start > limit || end > limit || start < min || end < min) {
      throw new Error(`${label}字段的值超出范围 ${min}-${limit}`);
    }
    for (let v = start; v <= end; v += step) out.add(allowSeven && v === 7 ? 0 : v);
  }
  return out;
}

function mockCronExplain(expr: string): Record<string, unknown> {
  const parts = expr.trim().split(/\s+/).filter(Boolean);
  if (parts.length !== 5 && parts.length !== 6) {
    throw new Error(`Cron 表达式需要 5 段（分 时 日 月 周）或 6 段（秒 分 时 日 月 周），当前是 ${parts.length} 段`);
  }
  const six = parts.length === 6;
  const off = six ? 1 : 0;
  const sec = six ? mockCronField(parts[0], 0, 59, "秒") : null;
  const minute = mockCronField(parts[off], 0, 59, "分");
  const hour = mockCronField(parts[off + 1], 0, 23, "时");
  const dom = mockCronField(parts[off + 2], 1, 31, "日");
  const month = mockCronField(parts[off + 3], 1, 12, "月");
  const dow = mockCronField(parts[off + 4], 0, 6, "周", true);

  const vals = (s: Set<number>) => [...s].sort((a, b) => a - b);
  const join = (s: Set<number>) => vals(s).join("、");
  const all = (s: Set<number>, min: number, max: number) => s.size >= max - min + 1;
  const stepOf = (s: Set<number>): number | null => {
    const v = vals(s);
    if (v.length < 2) return null;
    const d = v[1] - v[0];
    return d > 0 && v.every((x, i) => i === 0 || x - v[i - 1] === d) ? d : null;
  };
  const WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const weeks = () => vals(dow).map((v) => WEEK[v]).join("、");
  const months = () => join(month);
  const doms = () => join(dom);

  let date: string;
  const monthAll = all(month, 1, 12);
  const domAll = all(dom, 1, 31);
  const dowAll = dow.size === 7;
  if (monthAll && domAll && dowAll) date = "每天";
  else if (monthAll && domAll) date = `每${weeks()}`;
  else if (monthAll && dowAll) date = `每月${doms()}号`;
  else if (monthAll) date = `每月${doms()}号或每${weeks()}`;
  else if (domAll && dowAll) date = `每年${months()}月的每一天`;
  else if (domAll) date = `每年${months()}月的每${weeks()}`;
  else if (dowAll) date = `每年${months()}月${doms()}号`;
  else date = `每年${months()}月${doms()}号或每${weeks()}`;

  const hourAll = all(hour, 0, 23);
  const minAll = all(minute, 0, 59);
  let time: string;
  if (hourAll && minAll) {
    if (!sec) time = "每分钟";
    else if (all(sec, 0, 59)) time = "每秒";
    else {
      const st = stepOf(sec);
      time = st ? `每 ${st} 秒` : `每分钟的第 ${join(sec)} 秒`;
    }
  } else if (hourAll) {
    const st = stepOf(minute);
    time = st ? `每 ${st} 分钟` : `每小时的第 ${join(minute)} 分钟`;
  } else if (minAll) {
    const st = stepOf(hour);
    time = st ? `每 ${st} 小时` : `在 ${join(hour)} 点内每分钟`;
  } else {
    const h = vals(hour);
    const m = vals(minute);
    if (h.length === 1 && m.length === 1) {
      time = `${String(h[0]).padStart(2, "0")}:${String(m[0]).padStart(2, "0")}`;
      if (sec && sec.size === 1) time += `:${String(vals(sec)[0]).padStart(2, "0")}`;
    } else {
      time = `在 ${join(hour)} 点 ${join(minute)} 分`;
    }
  }

  const description =
    date === "每天"
      ? time.startsWith("每")
        ? `${time}执行一次`
        : `每天 ${time} 执行`
      : `${date} ${time} 执行`;
  return { normalized: parts.join(" "), fields: parts.length, description };
}

