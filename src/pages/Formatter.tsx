import { useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { Card } from "../components/Card";
import { CopyButton } from "../components/CopyButton";
import { Segmented } from "../components/Segmented";
import { Tabs, type TabItem } from "../components/Tabs";
import { call } from "../lib/api";

type TabId =
  | "json"
  | "sql"
  | "js"
  | "xml"
  | "html"
  | "css"
  | "yaml"
  | "markdown"
  | "url";

const TABS: TabItem<TabId>[] = [
  { id: "json", label: "JSON" },
  { id: "sql", label: "SQL" },
  { id: "js", label: "JavaScript" },
  { id: "xml", label: "XML" },
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS / SCSS" },
  { id: "yaml", label: "YAML" },
  { id: "markdown", label: "Markdown" },
  { id: "url", label: "URL 参数" },
];

function errText(e: unknown): string {
  return typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
}

/** 所有格式化面板共用的输入 / 输出骨架。 */
function FormatPanel({
  sample,
  placeholder,
  run,
  options,
  minify,
  minifyLabel = "压缩",
  hint,
  rows = 10,
}: {
  sample: string;
  placeholder: string;
  run: (input: string, minify: boolean) => Promise<string>;
  options?: ReactNode;
  /** 是否提供「压缩 / 单行」按钮 */
  minify?: boolean;
  minifyLabel?: string;
  hint?: ReactNode;
  rows?: number;
}) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function exec(compact: boolean) {
    if (!input.trim()) {
      setOutput("");
      setError("");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setOutput(await run(input, compact));
    } catch (e) {
      setOutput("");
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card title="输入">
        <textarea
          className="textarea"
          rows={rows}
          value={input}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(e) => setInput(e.target.value)}
        />
        {options && <div className="option-row">{options}</div>}
        <div className="row panel-actions">
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => exec(false)}
          >
            {busy ? "处理中…" : "格式化"}
          </button>
          {minify && (
            <button type="button" className="btn" disabled={busy} onClick={() => exec(true)}>
              {minifyLabel}
            </button>
          )}
          <button type="button" className="btn ghost" onClick={() => setInput(sample)}>
            示例
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setInput("");
              setOutput("");
              setError("");
            }}
          >
            <Trash2 size={14} />
            清空
          </button>
          {hint && <span className="hint panel-hint">{hint}</span>}
        </div>
        {error && <div className="err-box">{error}</div>}
      </Card>

      <Card title="结果" right={<CopyButton text={output} />}>
        {output ? (
          <pre className="code-block">{output}</pre>
        ) : (
          <div className="code-empty">格式化后的内容会显示在这里</div>
        )}
      </Card>
    </>
  );
}

function JsonTab() {
  const [indent, setIndent] = useState<"2" | "4">("2");
  const [sortKeys, setSortKeys] = useState(false);
  const [expand, setExpand] = useState(false);

  return (
    <FormatPanel
      sample={'{"name":"dev-helper","tags":["json","format"],"nested":"{\\"a\\":1}"}'}
      placeholder="粘贴 JSON，支持 .json / JSON5 的常见写法"
      minify
      hint="压缩会输出单行；勾选「展开字符串」会解析嵌套的 JSON 字符串。"
      options={
        <>
          <label className="option">
            缩进
            <Segmented
              value={indent}
              options={[
                { value: "2", label: "2 空格" },
                { value: "4", label: "4 空格" },
              ]}
              onChange={setIndent}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={sortKeys}
              onChange={(e) => setSortKeys(e.target.checked)}
            />
            键名排序
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={expand}
              onChange={(e) => setExpand(e.target.checked)}
            />
            展开嵌套 JSON 字符串
          </label>
        </>
      }
      run={(text, compact) =>
        call<string>("json_format", {
          text,
          indent: Number(indent),
          sortKeys,
          minify: compact,
          expandStrings: expand,
        })
      }
    />
  );
}

function SqlTab() {
  const [indent, setIndent] = useState<"2" | "4">("2");
  const [upper, setUpper] = useState(true);

  return (
    <FormatPanel
      sample={"select u.id,u.name,count(o.id) from users u left join orders o on o.user_id=u.id where u.created_at>='2026-01-01' group by u.id,u.name order by count(o.id) desc"}
      placeholder="粘贴 SELECT / INSERT / UPDATE 等 SQL"
      hint="基于 sqlformat，支持 MySQL / PostgreSQL 常见语法。"
      options={
        <>
          <label className="option">
            缩进
            <Segmented
              value={indent}
              options={[
                { value: "2", label: "2 空格" },
                { value: "4", label: "4 空格" },
              ]}
              onChange={setIndent}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={upper}
              onChange={(e) => setUpper(e.target.checked)}
            />
            关键字转大写
          </label>
        </>
      }
      run={(text) =>
        call<string>("sql_format", { text, upper, indent: Number(indent) })
      }
    />
  );
}

function JsTab() {
  const [indent, setIndent] = useState<"2" | "4">("2");
  const [lineWidth, setLineWidth] = useState<"80" | "100" | "120">("100");
  const [quote, setQuote] = useState("prefer-double");
  const [semicolons, setSemicolons] = useState("prefer");

  return (
    <FormatPanel
      sample={'const user={id:1,name:"Ada",tags:["dev","ts"]};function greet(u){if(u){return `Hi, ${u.name}`;}return "Hi";}'}
      placeholder="粘贴 JavaScript / TypeScript / JSX 源码"
      hint="基于 dprint，风格接近 Prettier。"
      rows={12}
      options={
        <>
          <label className="option">
            缩进
            <Segmented
              value={indent}
              options={[
                { value: "2", label: "2 空格" },
                { value: "4", label: "4 空格" },
              ]}
              onChange={setIndent}
            />
          </label>
          <label className="option">
            行宽
            <select
              className="input num"
              value={lineWidth}
              onChange={(e) => setLineWidth(e.target.value as "80" | "100" | "120")}
            >
              <option value="80">80</option>
              <option value="100">100</option>
              <option value="120">120</option>
            </select>
          </label>
          <label className="option">
            引号
            <select
              className="input"
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
            >
              <option value="prefer-double">优先双引号</option>
              <option value="prefer-single">优先单引号</option>
              <option value="double">始终双引号</option>
              <option value="single">始终单引号</option>
            </select>
          </label>
          <label className="option">
            分号
            <select
              className="input"
              value={semicolons}
              onChange={(e) => setSemicolons(e.target.value)}
            >
              <option value="prefer">保留</option>
              <option value="always">总是添加</option>
              <option value="asi">尽量省略</option>
            </select>
          </label>
        </>
      }
      run={(text) =>
        call<string>("js_format", {
          text,
          indent: Number(indent),
          lineWidth: Number(lineWidth),
          quoteStyle: quote,
          semicolons,
        })
      }
    />
  );
}

function XmlTab() {
  const [indent, setIndent] = useState<"2" | "4">("2");
  return (
    <FormatPanel
      sample={'<?xml version="1.0" encoding="UTF-8"?><order id="A1"><item sku="X">2</item><note><![CDATA[<raw>]]></note></order>'}
      placeholder="粘贴 XML，会先做良构校验再排版"
      hint="保留属性、注释与 CDATA；<tag>text</tag> 保持单行。"
      options={
        <label className="option">
          缩进
          <Segmented
            value={indent}
            options={[
              { value: "2", label: "2 空格" },
              { value: "4", label: "4 空格" },
            ]}
            onChange={setIndent}
          />
        </label>
      }
      run={(text) =>
        call<string>("text_format", { kind: "xml", text, indent: Number(indent) })
      }
    />
  );
}

function HtmlTab() {
  const [indent, setIndent] = useState<"2" | "4">("2");
  return (
    <FormatPanel
      sample={'<!doctype html><html><head><meta charset="utf-8"><title>Demo</title></head><body><div class="wrap"><p>Hello <strong>world</strong></p><img src="a.png" alt=""></div></body></html>'}
      placeholder="粘贴 HTML 片段或整页"
      hint="基础缩进：自动识别 void 标签，script / style / pre 内容原样保留。"
      options={
        <label className="option">
          缩进
          <Segmented
            value={indent}
            options={[
              { value: "2", label: "2 空格" },
              { value: "4", label: "4 空格" },
            ]}
            onChange={setIndent}
          />
        </label>
      }
      run={(text) =>
        call<string>("text_format", { kind: "html", text, indent: Number(indent) })
      }
    />
  );
}

function CssTab() {
  const [indent, setIndent] = useState<"2" | "4">("2");
  return (
    <FormatPanel
      sample={".btn{color:#fff;background:linear-gradient(90deg,#5b6cff,#8f5bff);padding:8px 14px;border-radius:8px;&:hover{opacity:.9}}@media(max-width:640px){.btn{width:100%}}"}
      placeholder="粘贴 CSS 或 SCSS"
      hint="按花括号缩进，字符串、注释和 url() 内的分号不会被拆开。"
      options={
        <label className="option">
          缩进
          <Segmented
            value={indent}
            options={[
              { value: "2", label: "2 空格" },
              { value: "4", label: "4 空格" },
            ]}
            onChange={setIndent}
          />
        </label>
      }
      run={(text) =>
        call<string>("text_format", { kind: "css", text, indent: Number(indent) })
      }
    />
  );
}

function YamlTab() {
  return (
    <FormatPanel
      sample={"service:\n  name: dev-helper\n  ports:\n    - 1420\n  env:\n    DEBUG: true\n"}
      placeholder="粘贴 YAML"
      hint="会解析后重新序列化；注释、锚点和自定义格式无法保留。"
      run={(text) => call<string>("text_format", { kind: "yaml", text, indent: 2 })}
    />
  );
}

function MarkdownTab() {
  return (
    <FormatPanel
      sample={"#标题\n\n\n\n正文段落   \n\n- 列表项   \n- 另一项\n\n\n\n## 小节\n"}
      placeholder="粘贴 Markdown"
      hint="保守整理：去尾随空格、压缩连续空行、补标题空格，不重排正文与表格。"
      run={(text) => call<string>("text_format", { kind: "markdown", text, indent: 2 })}
    />
  );
}

function UrlTab() {
  const [sort, setSort] = useState(true);
  return (
    <FormatPanel
      sample={"https://example.com/search?tag=dev&q=%E6%A0%BC%E7%BE%A1%E5%8C%96&page=2&lang=zh-CN"}
      placeholder="粘贴完整 URL、?a=1&b=2 或裸查询串"
      hint="输出解码后的参数，一条一行并按键对齐；不会修改原 URL。"
      options={
        <label className="check">
          <input
            type="checkbox"
            checked={sort}
            onChange={(e) => setSort(e.target.checked)}
          />
          按键名排序
        </label>
      }
      run={(text) => call<string>("url_params_format", { text, sort })}
    />
  );
}

export default function Formatter() {
  const [active, setActive] = useState<TabId>("json");

  return (
    <>
      <Tabs value={active} items={TABS} onChange={setActive} />
      <div hidden={active !== "json"}>
        <JsonTab />
      </div>
      <div hidden={active !== "sql"}>
        <SqlTab />
      </div>
      <div hidden={active !== "js"}>
        <JsTab />
      </div>
      <div hidden={active !== "xml"}>
        <XmlTab />
      </div>
      <div hidden={active !== "html"}>
        <HtmlTab />
      </div>
      <div hidden={active !== "css"}>
        <CssTab />
      </div>
      <div hidden={active !== "yaml"}>
        <YamlTab />
      </div>
      <div hidden={active !== "markdown"}>
        <MarkdownTab />
      </div>
      <div hidden={active !== "url"}>
        <UrlTab />
      </div>
    </>
  );
}
