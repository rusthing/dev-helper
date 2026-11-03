import { useEffect, useState } from "react";
import { call } from "../lib/api";
import { Card } from "../components/Card";
import { CopyButton } from "../components/CopyButton";
import { Segmented } from "../components/Segmented";
import { usePref } from "../lib/prefs";

type Indent = "2" | "4";

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
        <textarea className="textarea" rows={12} value={out} readOnly spellCheck={false} />
      </Card>
    </>
  );
}
