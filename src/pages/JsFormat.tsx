import { useEffect, useState } from "react";
import { call } from "../lib/api";
import { Card } from "../components/Card";
import { CopyButton } from "../components/CopyButton";
import { usePref } from "../lib/prefs";

const PLACEHOLDER = `粘贴 JavaScript / TypeScript / JSX，例如：
const user={name:"Ada",tags:["x","y"]};function greet(u){return \`hi \${u.name}\`}`;

export default function JsFormat() {
  const [src, setSrc] = useState("");
  const [out, setOut] = useState("");
  const [err, setErr] = useState("");
  const [indent, setIndent] = usePref("js.indent", 2);
  const [lineWidth, setLineWidth] = usePref("js.lineWidth", 80);
  const [quote, setQuote] = usePref("js.quote", "prefer-single");
  const [semi, setSemi] = usePref("js.semi", "prefer");

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!src.trim()) {
        setOut("");
        setErr("");
        return;
      }
      call<string>("js_format", {
        text: src,
        indent,
        lineWidth,
        quoteStyle: quote,
        semicolons: semi,
      })
        .then((r) => {
          setOut(r);
          setErr("");
        })
        .catch((e) => {
          setOut("");
          setErr(String(e));
        });
    }, 160);
    return () => window.clearTimeout(id);
  }, [src, indent, lineWidth, quote, semi]);

  return (
    <>
      <Card title="源码">
        <textarea
          className="textarea"
          rows={10}
          value={src}
          onChange={(e) => setSrc(e.target.value)}
          placeholder={PLACEHOLDER}
          spellCheck={false}
        />
        <div className="row" style={{ marginTop: 10 }}>
          <label className="check">
            缩进
            <select
              className="input"
              style={{ width: 96, height: 28 }}
              value={indent}
              onChange={(e) => setIndent(Number(e.target.value))}
            >
              <option value={2}>2 空格</option>
              <option value={4}>4 空格</option>
            </select>
          </label>
          <label className="check">
            列宽
            <select
              className="input"
              style={{ width: 84, height: 28 }}
              value={lineWidth}
              onChange={(e) => setLineWidth(Number(e.target.value))}
            >
              <option value={80}>80</option>
              <option value={100}>100</option>
              <option value={120}>120</option>
            </select>
          </label>
          <label className="check">
            引号
            <select
              className="input"
              style={{ width: 96, height: 28 }}
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
            >
              <option value="prefer-single">单引号</option>
              <option value="prefer-double">双引号</option>
            </select>
          </label>
          <label className="check">
            分号
            <select
              className="input"
              style={{ width: 96, height: 28 }}
              value={semi}
              onChange={(e) => setSemi(e.target.value)}
            >
              <option value="prefer">保留</option>
              <option value="always">总是加</option>
              <option value="asi">尽量去掉</option>
            </select>
          </label>
        </div>
      </Card>

      <Card title="结果" right={<CopyButton text={out} />}>
        {err ? <div className="err-box">{err}</div> : <pre className="code-block">{out}</pre>}
      </Card>
    </>
  );
}
