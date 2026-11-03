import { useEffect, useState } from "react";
import { call } from "../lib/api";
import { Card } from "../components/Card";
import { CopyButton } from "../components/CopyButton";
import { usePref } from "../lib/prefs";

export default function Format() {
  const [sql, setSql] = useState("");
  const [out, setOut] = useState("");
  const [upper, setUpper] = usePref("sql.upper", true);
  const [indent, setIndent] = usePref("sql.indent", 2);

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!sql.trim()) {
        setOut("");
        return;
      }
      call<string>("sql_format", { text: sql, upper, indent })
        .then(setOut)
        .catch(() => setOut(""));
    }, 160);
    return () => window.clearTimeout(id);
  }, [sql, upper, indent]);

  return (
    <>
      <Card title="SQL">
        <textarea
          className="textarea"
          rows={8}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          placeholder="select * from users where id = 1"
          spellCheck={false}
        />
        <div className="row" style={{ marginTop: 10 }}>
          <label className="check">
            <input type="checkbox" checked={upper} onChange={(e) => setUpper(e.target.checked)} />
            关键字大写
          </label>
          <label className="check">
            缩进
            <select
              className="input"
              style={{ width: 100, height: 28 }}
              value={indent}
              onChange={(e) => setIndent(Number(e.target.value))}
            >
              <option value={2}>2 空格</option>
              <option value={4}>4 空格</option>
            </select>
          </label>
        </div>
      </Card>

      <Card title="结果" right={<CopyButton text={out} />}>
        <pre className="code-block">{out}</pre>
      </Card>
    </>
  );
}
