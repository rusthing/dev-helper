import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { call } from "../lib/api";
import { Card } from "../components/Card";
import { CopyButton } from "../components/CopyButton";
import { Segmented } from "../components/Segmented";
import { usePref } from "../lib/prefs";

type Indent = "2" | "4";

interface JsonError {
  message: string;
  /** 1 基；0 表示没有位置信息（退化为只显示消息） */
  line: number;
  column: number;
}

// 两类模板占位符：{{x}}（mustache 类）与 ${x}（JS 表达式类）。
// 在格式化的结果文本里把它们标出来，便于一眼看清哪些是模板变量。
// expr 分支用 [^{}]* 而不是 .*?，避免 ${ {obj} } 这类内部含 { 的表达式
// 提前截止；常规 ${a.b.c} / ${arr[0]} 都正常。占位符出现在字符串值里时
// Rust 端本来就会原样保留（它是合法 JSON 字符串内容）。
const INJECT_RE = /\{\{[^}]*\}\}|\$\{[^{}]*\}/g;

function highlightInjects(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  INJECT_RE.lastIndex = 0;
  while ((m = INJECT_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const cls =
      m[0].startsWith("{{")
        ? "token-inject token-inject--mustache"
        : "token-inject token-inject--expr";
    nodes.push(
      <span key={key++} className={cls}>
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
    if (m.index === INJECT_RE.lastIndex) INJECT_RE.lastIndex++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** 尝试把一段文本解析成 Rust/mock 约定的 {message,line,column} */
function parseStructured(raw: string): JsonError | null {
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === "object" && typeof v.message === "string") {
      return {
        message: v.message,
        line: Number(v.line) || 0,
        column: Number(v.column) || 0,
      };
    }
  } catch {
    /* 普通错误文本，没有结构 */
  }
  return null;
}

/**
 * 归一化错误：Rust 侧把 {message,line,column} 序列化成 JSON 字符串放进
 * Err(String)；浏览器预览的 mock 抛 Error，message 里是同样的 JSON 字符串。
 * 注意 Error 本身也是 object 且带 message，必须先按 Error 处理，
 * 否则会被当成结构化对象、line/column 读成 undefined。
 */
function normalizeError(e: unknown): JsonError {
  if (typeof e === "string") {
    return parseStructured(e) ?? { message: e, line: 0, column: 0 };
  }
  if (e instanceof Error) {
    return parseStructured(e.message) ?? { message: e.message, line: 0, column: 0 };
  }
  // 万一 IPC 直接给了结构化对象（而不是 JSON 字符串）
  if (e && typeof e === "object" && typeof (e as JsonError).message === "string") {
    const v = e as JsonError;
    return { message: v.message, line: Number(v.line) || 0, column: Number(v.column) || 0 };
  }
  return { message: String(e), line: 0, column: 0 };
}

/** 1 基行列换成字符串里的绝对偏移；没有位置信息时返回 -1 */
function errorOffset(text: string, line: number, column: number): number {
  if (line < 1 || column < 1) return -1;
  const lines = text.split("\n");
  if (line > lines.length) return -1;
  let off = 0;
  for (let i = 0; i < line - 1; i++) off += lines[i].length + 1;
  return Math.min(off + column - 1, text.length);
}

/** 出错时结果区显示原文，把出错的那个字符标红；EOF 错误用一个 ␄ 占位 */
function renderErrorText(text: string, err: JsonError): ReactNode[] {
  const off = errorOffset(text, err.line, err.column);
  if (off < 0) return [text];
  const ch = text[off] ?? "";
  const nodes: ReactNode[] = [];
  if (off > 0) nodes.push(text.slice(0, off));
  nodes.push(
    <span
      key="err"
      className={ch ? "err-char" : "err-char err-char--eof"}
      title="语法错误位置"
    >
      {ch || "␄"}
    </span>,
  );
  if (off + ch.length < text.length) nodes.push(text.slice(off + ch.length));
  return nodes;
}

/** 错误条里的出错行 + 等宽字体下的 ^ 指位 */
function errorSnippet(text: string, err: JsonError) {
  const lineText = text.split("\n")[err.line - 1] ?? "";
  const caret = " ".repeat(Math.max(0, err.column - 1)) + "^";
  return { lineText, caret };
}

export default function Json() {
  const [input, setInput] = useState("");
  const [out, setOut] = useState("");
  const [err, setErr] = useState<JsonError | null>(null);
  const [indent, setIndent] = usePref<Indent>("json.indent", "2");
  const [sortKeys, setSortKeys] = usePref("json.sortKeys", false);
  const [expand, setExpand] = usePref("json.expand", false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const id = window.setTimeout(async () => {
      if (!input.trim()) {
        setOut("");
        setErr(null);
        return;
      }
      try {
        const r = await call<string>("json_format", {
          text: input,
          indent: Number(indent),
          sortKeys,
          minify: false,
          expandStrings: expand,
        });
        setOut(r);
        setErr(null);
      } catch (e) {
        setOut("");
        setErr(normalizeError(e));
      }
    }, 150);
    return () => window.clearTimeout(id);
  }, [input, indent, sortKeys, expand]);

  async function minify() {
    try {
      setOut(
        await call<string>("json_format", {
          text: input,
          indent: 2,
          sortKeys,
          minify: true,
          expandStrings: expand,
        }),
      );
      setErr(null);
    } catch (e) {
      setOut("");
      setErr(normalizeError(e));
    }
  }

  /** 把光标放到出错字符上并聚焦，方便直接改 */
  function locateError() {
    if (!err) return;
    const off = errorOffset(input, err.line, err.column);
    const ta = inputRef.current;
    if (off < 0 || !ta) return;
    ta.focus();
    ta.setSelectionRange(Math.min(off, input.length), Math.min(off + 1, input.length));
  }

  const snippet = err && err.line > 0 ? errorSnippet(input, err) : null;

  return (
    <>
      <Card
        title="输入 JSON"
        right={
          <div className="row">
            <Segmented
              value={indent}
              onChange={setIndent}
              options={[
                { value: "2", label: "2 空格" },
                { value: "4", label: "4 空格" },
              ]}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={sortKeys}
                onChange={(e) => setSortKeys(e.target.checked)}
              />
              键排序
            </label>
            <label className="check" title="把 ext 这类「字符串里套 JSON」的值也解析展开成嵌套对象">
              <input
                type="checkbox"
                checked={expand}
                onChange={(e) => setExpand(e.target.checked)}
              />
              展开内嵌 JSON
            </label>
            <button type="button" className="btn sm" onClick={minify}>
              压缩成一行
            </button>
          </div>
        }
      >
        <textarea
          ref={inputRef}
          className="textarea"
          rows={8}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='{"hello": "world"}'
          spellCheck={false}
        />
        {err && (
          <div className="err-box err-box--json">
            <div className="err-box__row">
              <span className="err-box__badge">语法错误</span>
              <span className="err-box__msg">{err.message}</span>
              {err.line > 0 && (
                <span className="err-box__pos">
                  第 {err.line} 行 · 第 {err.column} 列
                </span>
              )}
              {err.line > 0 && (
                <button type="button" className="btn sm" onClick={locateError}>
                  定位
                </button>
              )}
            </div>
            {snippet && (
              <pre className="err-box__snippet">
                {snippet.lineText}
                {"\n"}
                {snippet.caret}
              </pre>
            )}
          </div>
        )}
      </Card>

      <Card
        title={err ? "错误位置" : "结果"}
        right={err ? null : <CopyButton text={out} />}
      >
        {err ? (
          <pre className="code-pre code-pre--err">
            <code>{renderErrorText(input, err)}</code>
          </pre>
        ) : out ? (
          <pre className="code-pre">
            <code>{highlightInjects(out)}</code>
          </pre>
        ) : (
          <div className="code-empty">格式化结果会显示在这里</div>
        )}
      </Card>
    </>
  );
}
