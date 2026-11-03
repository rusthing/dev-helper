import { useEffect, useState, type ReactNode } from "react";
import { call } from "../lib/api";
import { Card } from "../components/Card";
import { usePref } from "../lib/prefs";

interface M {
  start: number;
  end: number;
  text: string;
  groups: string[];
}

interface R {
  matches: M[];
  error: string | null;
}

function highlight(text: string, matches: M[]): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  matches.forEach((m, i) => {
    if (m.start > last) out.push(text.slice(last, m.start));
    if (m.end > m.start) {
      out.push(<mark key={i}>{text.slice(m.start, m.end)}</mark>);
    }
    last = Math.max(last, m.end);
  });
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Regex() {
  const [pattern, setPattern] = useState("");
  const [text, setText] = useState("");
  const [ignoreCase, setIgnoreCase] = usePref("regex.ignoreCase", false);
  const [multiLine, setMultiLine] = usePref("regex.multiLine", false);
  const [dotAll, setDotAll] = usePref("regex.dotAll", false);
  const [res, setRes] = useState<R>({ matches: [], error: null });

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!pattern) {
        setRes({ matches: [], error: null });
        return;
      }
      call<R>("regex_test", { pattern, text, ignoreCase, multiLine, dotAll })
        .then(setRes)
        .catch(() => setRes({ matches: [], error: "调用失败" }));
    }, 130);
    return () => window.clearTimeout(id);
  }, [pattern, text, ignoreCase, multiLine, dotAll]);

  return (
    <>
      <Card title="正则表达式">
        <input
          className="input mono"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="例如 \d{4}-\d{2}-\d{2}"
          spellCheck={false}
        />
        <div className="row" style={{ marginTop: 10 }}>
          <label className="check">
            <input
              type="checkbox"
              checked={ignoreCase}
              onChange={(e) => setIgnoreCase(e.target.checked)}
            />
            忽略大小写
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={multiLine}
              onChange={(e) => setMultiLine(e.target.checked)}
            />
            多行 ^$
          </label>
          <label className="check">
            <input type="checkbox" checked={dotAll} onChange={(e) => setDotAll(e.target.checked)} />
            点号匹配换行
          </label>
          <span className="badge" style={{ marginLeft: "auto" }}>
            {res.matches.length} 处匹配
          </span>
        </div>
        {res.error && <div className="err-box">{res.error}</div>}
      </Card>

      <Card title="测试文本">
        <textarea
          className="textarea"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="把要匹配的文本贴进来…"
          spellCheck={false}
        />
      </Card>

      <Card title="高亮预览">
        <pre className="code-block">{highlight(text, res.matches)}</pre>
      </Card>

      {res.matches.length > 0 && (
        <Card title="匹配详情">
          <div className="kv-grid uuid-grid">
            {res.matches.slice(0, 200).map((m, i) => (
              <div key={`${m.start}-${i}`} className="uuid-row">
                <span className="k">#{i + 1}</span>
                <span className="v">
                  {m.text}
                  {m.groups.length > 0 && (
                    <span className="muted"> → [{m.groups.join(", ")}]</span>
                  )}
                </span>
                <span />
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
