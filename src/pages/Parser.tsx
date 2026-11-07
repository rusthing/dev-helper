import { Fragment, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Card } from "../components/Card";
import { CopyButton } from "../components/CopyButton";
import { Tabs, type TabItem } from "../components/Tabs";
import { call } from "../lib/api";
import { useTabUsage } from "../lib/tabUsage";
import type { JwtParts } from "../lib/types";
import ColorPanel from "./Color";
import UrlPanel from "./Url";
import CronPanel from "./Cron";

type TabId = "jwt" | "color" | "json" | "url" | "cron" | "ua";

const TABS: TabItem<TabId>[] = [
  { id: "jwt", label: "JWT" },
  { id: "color", label: "颜色" },
  { id: "json", label: "JSON" },
  { id: "url", label: "URL" },
  { id: "cron", label: "Cron" },
  { id: "ua", label: "User-Agent" },
];

const JWT_SAMPLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFkYSIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc2MjMwMDAwMCwiZXhwIjoxODkzNDU2MDAwfQ.c2lnbmnhdHVyZQ";

const JSON_SAMPLE =
  '{"user":{"id":7,"name":"Ada","tags":["dev","ts"],"active":true},"total":2,"note":null}';

const UA_SAMPLE =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function errText(e: unknown): string {
  return typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
}

function jsonType(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function jsonPreview(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return `${v.length} 项`;
  if (typeof v === "object") return `${Object.keys(v as object).length} 个字段`;
  if (typeof v === "string") {
    return v.length > 80 ? `${JSON.stringify(v.slice(0, 80))}…` : JSON.stringify(v);
  }
  return String(v);
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString("zh-CN", { hour12: false });
}

/* ---------- JWT ---------- */

interface ClaimRow {
  key: string;
  type: string;
  value: string;
  note: string;
}

const TIME_CLAIMS: Record<string, string> = {
  iat: "签发时间",
  exp: "过期时间",
  nbf: "生效时间",
  auth_time: "认证时间",
};

function claimRows(payload: string): ClaimRow[] {
  const rows: ClaimRow[] = [];
  try {
    const v: unknown = JSON.parse(payload);
    if (!v || typeof v !== "object" || Array.isArray(v)) return rows;
    for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
      const time = typeof val === "number" ? TIME_CLAIMS[key] : undefined;
      rows.push({
        key,
        type: jsonType(val),
        value:
          typeof val === "string"
            ? val
            : val !== null && typeof val === "object"
              ? JSON.stringify(val)
              : String(val),
        note: time && typeof val === "number" ? `${time}：${fmtTime(val * 1000)}` : "",
      });
    }
  } catch {
    /* payload 不是 JSON 时只展示原文 */
  }
  return rows;
}

function expiryOf(payload: string): { expired: boolean; text: string } | null {
  try {
    const v = JSON.parse(payload) as { exp?: unknown };
    if (typeof v.exp === "number") {
      const ms = v.exp * 1000;
      const expired = ms < Date.now();
      return { expired, text: `${expired ? "已过期" : "未过期"} · ${fmtTime(ms)}` };
    }
  } catch {
    /* 忽略非 JSON payload */
  }
  return null;
}

function JwtPanel() {
  const [token, setToken] = useState("");
  const [parts, setParts] = useState<JwtParts | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const id = window.setTimeout(() => {
      if (!token.trim()) {
        setParts(null);
        setError("");
        return;
      }
      call<JwtParts>("jwt_decode", { token })
        .then((r) => {
          if (!alive) return;
          if (r.error) {
            setParts(null);
            setError(r.error);
          } else {
            setParts(r);
            setError("");
          }
        })
        .catch((e) => {
          if (!alive) return;
          setParts(null);
          setError(errText(e));
        });
    }, 180);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [token]);

  const rows = parts ? claimRows(parts.payload) : [];
  const expiry = parts ? expiryOf(parts.payload) : null;

  return (
    <>
      <Card title="JWT">
        <textarea
          className="textarea"
          rows={5}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="粘贴 JWT（header.payload.signature）"
          spellCheck={false}
        />
        <div className="row panel-actions">
          <button type="button" className="btn ghost" onClick={() => setToken(JWT_SAMPLE)}>
            示例
          </button>
          <button type="button" className="btn ghost" onClick={() => setToken("")}>
            <Trash2 size={14} />
            清空
          </button>
        </div>
        {error && <div className="err-box">{error}</div>}
      </Card>

      {parts && (
        <>
          {expiry && (
            <div className={expiry.expired ? "err-box" : "claim-note"}>
              {expiry.text}
            </div>
          )}

          <Card title={`Header · ${parts.alg}`} right={<CopyButton text={parts.header} />}>
            <pre className="code-block">{parts.header}</pre>
          </Card>

          {rows.length > 0 && (
            <Card title="Payload 字段">
              <div className="claim-grid">
                <span className="claim-head">字段</span>
                <span className="claim-head">类型</span>
                <span className="claim-head">值</span>
                <span />
                {rows.map((r) => (
                  <Fragment key={r.key}>
                    <span className="claim-key">{r.key}</span>
                    <span className={`claim-type claim-type--${r.type}`}>{r.type}</span>
                    <span className="claim-value">
                      {r.value}
                      {r.note && <em className="claim-time">{r.note}</em>}
                    </span>
                    <CopyButton text={r.value} />
                  </Fragment>
                ))}
              </div>
            </Card>
          )}

          <Card title="Payload" right={<CopyButton text={parts.payload} />}>
            <pre className="code-block">{parts.payload}</pre>
          </Card>

          <Card title="Signature">
            <div className="kv-grid">
              <span className="k">算法</span>
              <span className="v">{parts.alg}</span>
              <span />
              <span className="k">签名</span>
              <span className="v">{parts.signature || "（空）"}</span>
              <CopyButton text={parts.signature} />
            </div>
            <p className="hint">这里只做解码，不校验签名有效性。</p>
          </Card>
        </>
      )}
    </>
  );
}

/* ---------- JSON ---------- */

interface JsonNode {
  path: string;
  type: string;
  value: string;
}

function walkJson(v: unknown, path: string, rows: JsonNode[]) {
  rows.push({ path, type: jsonType(v), value: jsonPreview(v) });
  if (Array.isArray(v)) {
    v.forEach((item, i) => walkJson(item, `${path}[${i}]`, rows));
    return;
  }
  if (v && typeof v === "object") {
    for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
      const child = /^[A-Za-z_$][\w$]*$/.test(key)
        ? `${path}.${key}`
        : `${path}[${JSON.stringify(key)}]`;
      walkJson(val, child, rows);
    }
  }
}

function JsonPanel() {
  const [text, setText] = useState("");
  const [out, setOut] = useState("");
  const [rows, setRows] = useState<JsonNode[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!text.trim()) {
        setOut("");
        setRows([]);
        setErr("");
        return;
      }
      try {
        const v: unknown = JSON.parse(text);
        const next: JsonNode[] = [];
        walkJson(v, "$", next);
        setOut(JSON.stringify(v, null, 2));
        setRows(next);
        setErr("");
      } catch (e) {
        setOut("");
        setRows([]);
        setErr(`JSON 解析失败：${errText(e)}`);
      }
    }, 160);
    return () => window.clearTimeout(id);
  }, [text]);

  return (
    <>
      <Card title="JSON 输入">
        <textarea
          className="textarea"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='{"user":{"id":7,"name":"Ada"}}'
          spellCheck={false}
        />
        <div className="row panel-actions">
          <button type="button" className="btn ghost" onClick={() => setText(JSON_SAMPLE)}>
            示例
          </button>
          <button type="button" className="btn ghost" onClick={() => setText("")}>
            <Trash2 size={14} />
            清空
          </button>
        </div>
        {err && <div className="err-box">{err}</div>}
      </Card>

      {rows.length > 0 && (
        <Card title={`结构路径（${rows.length} 个节点）`}>
          <div className="claim-grid">
            <span className="claim-head">路径</span>
            <span className="claim-head">类型</span>
            <span className="claim-head">值</span>
            <span />
            {rows.map((r) => (
              <Fragment key={r.path}>
                <span className="claim-key mono">{r.path}</span>
                <span className={`claim-type claim-type--${r.type}`}>{r.type}</span>
                <span className="claim-value">{r.value}</span>
                <CopyButton text={r.path} />
              </Fragment>
            ))}
          </div>
        </Card>
      )}

      {out && (
        <Card title="格式化 JSON" right={<CopyButton text={out} />}>
          <pre className="code-block">{out}</pre>
        </Card>
      )}
    </>
  );
}

/* ---------- User-Agent ---------- */

function detectBrowser(ua: string): string {
  const rules: [RegExp, string][] = [
    [/Edg(?:e|A|iOS)?\/([\d.]+)/, "Edge"],
    [/OPR\/([\d.]+)/, "Opera"],
    [/MicroMessenger\/([\d.]+)/, "微信内置浏览器"],
    [/Firefox\/([\d.]+)/, "Firefox"],
    [/FxiOS\/([\d.]+)/, "Firefox"],
    [/Chrome\/([\d.]+)/, "Chrome"],
    [/CriOS\/([\d.]+)/, "Chrome"],
    [/Version\/([\d.]+).*Safari/, "Safari"],
  ];
  for (const [re, name] of rules) {
    const m = ua.match(re);
    if (m) return `${name} ${m[1]}`;
  }
  if (/Safari\//.test(ua)) return "Safari";
  return "未知";
}

function detectEngine(ua: string): string {
  if (/Edg|Chrome|CriOS|OPR/.test(ua)) return "Blink";
  if (/Firefox|FxiOS/.test(ua)) return "Gecko";
  if (/AppleWebKit/.test(ua)) return "WebKit";
  return "未知";
}

function detectOs(ua: string): string {
  let m = ua.match(/Windows NT ([\d.]+)/);
  if (m) {
    const v = m[1];
    if (v === "10.0") return "Windows 10 / 11";
    if (v === "6.3") return "Windows 8.1";
    if (v === "6.2") return "Windows 8";
    if (v === "6.1") return "Windows 7";
    return `Windows NT ${v}`;
  }
  m = ua.match(/Android ([\d.]+)/);
  if (m) return `Android ${m[1]}`;
  m = ua.match(/iPhone|iPad|iPod/);
  if (m) {
    const ver = ua.match(/OS ([\d_]+)/);
    return ver ? `iOS ${ver[1].replace(/_/g, ".")}` : "iOS";
  }
  m = ua.match(/Mac OS X ([\d_]+)/);
  if (m) return `macOS ${m[1].replace(/_/g, ".")}`;
  if (/Linux/.test(ua)) return "Linux";
  return "未知";
}

function detectDevice(ua: string): string {
  if (/iPad|Tablet/.test(ua)) return "平板";
  if (/iPhone|Mobile|Android/.test(ua)) return "手机";
  return "桌面";
}

function detectArch(ua: string): string {
  if (/arm64|aarch64/i.test(ua)) return "ARM64";
  if (/x86_64|Win64|x64/i.test(ua)) return "x86_64";
  if (/\barm\b/i.test(ua)) return "ARM";
  return "未知";
}

function UaPanel() {
  const [ua, setUa] = useState("");
  const rows: [string, string][] = ua.trim()
    ? [
        ["浏览器", detectBrowser(ua)],
        ["引擎", detectEngine(ua)],
        ["操作系统", detectOs(ua)],
        ["设备类型", detectDevice(ua)],
        ["架构", detectArch(ua)],
      ]
    : [];

  return (
    <>
      <Card title="User-Agent">
        <textarea
          className="textarea"
          rows={5}
          value={ua}
          onChange={(e) => setUa(e.target.value)}
          placeholder="粘贴浏览器或客户端的 User-Agent"
          spellCheck={false}
        />
        <div className="row panel-actions">
          <button type="button" className="btn ghost" onClick={() => setUa(UA_SAMPLE)}>
            示例
          </button>
          <button type="button" className="btn ghost" onClick={() => setUa("")}>
            <Trash2 size={14} />
            清空
          </button>
          <span className="hint panel-hint">
            基于常见 UA 特征做启发式识别，定制客户端可能识别不准。
          </span>
        </div>
      </Card>

      {rows.length > 0 && (
        <Card title="解析结果">
          <div className="kv-grid">
            {rows.map(([k, v]) => (
              <Fragment key={k}>
                <span className="k">{k}</span>
                <span className="v">{v}</span>
                <CopyButton text={v} />
              </Fragment>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

export default function Parser() {
  const [active, setActive] = useState<TabId>("jwt");
  const { items, record } = useTabUsage("parser", TABS);

  function select(id: TabId) {
    setActive(id);
    record(id);
  }

  return (
    <>
      <Tabs value={active} items={items} onChange={select} />
      <div hidden={active !== "jwt"}>
        <JwtPanel />
      </div>
      <div hidden={active !== "color"}>
        <ColorPanel />
      </div>
      <div hidden={active !== "json"}>
        <JsonPanel />
      </div>
      <div hidden={active !== "url"}>
        <UrlPanel />
      </div>
      <div hidden={active !== "cron"}>
        <CronPanel />
      </div>
      <div hidden={active !== "ua"}>
        <UaPanel />
      </div>
    </>
  );
}
