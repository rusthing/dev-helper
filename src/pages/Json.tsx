import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { call } from "../lib/api";
import { Card } from "../components/Card";
import { CopyButton } from "../components/CopyButton";
import { Segmented } from "../components/Segmented";
import { usePref } from "../lib/prefs";

type Indent = "2" | "4";

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

export default function Json() {
  const [input, setInput] = useState("");
  const [out, setOut] = useState("");
  const [err, setErr] = useState("");
  const [indent, setIndent] = usePref<Indent>("json.indent", "2");
  const [sortKeys, setSortKeys] = usePref("json.sortKeys", false);
  const [expand, setExpand] = usePref("json.expand", false);

  useEffect(() => {
    const id = window.setTimeout(async () => {
      if (!input.trim()) {
        setOut("");
        setErr("");
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
        setErr("");
      } catch (e) {
        setOut("");
        setErr(String(e));
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
      setErr("");
    } catch (e) {
      setErr(String(e));
    }
  }

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
          className="textarea"
          rows={8}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='{"hello": "world"}'
          spellCheck={false}
        />
        {err && <div className="err-box">{err}</div>}
      </Card>

      <Card title="结果" right={<CopyButton text={out} />}>
        {out ? (
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
