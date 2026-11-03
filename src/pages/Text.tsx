import { useEffect, useState } from "react";
import { call } from "../lib/api";
import { Card } from "../components/Card";
import { CopyButton } from "../components/CopyButton";

interface Stats {
  chars: number;
  chars_no_space: number;
  words: number;
  lines: number;
  bytes: number;
}

const OPS: { op: string; label: string }[] = [
  { op: "upper", label: "大写" },
  { op: "lower", label: "小写" },
  { op: "title", label: "首字母大写" },
  { op: "snake", label: "snake_case" },
  { op: "kebab", label: "kebab-case" },
  { op: "camel", label: "camelCase" },
  { op: "pascal", label: "PascalCase" },
  { op: "trim", label: "去首尾空白" },
  { op: "trim-lines", label: "去每行空白" },
  { op: "remove-empty", label: "删空行" },
  { op: "dedup-lines", label: "行去重" },
  { op: "sort-lines", label: "行排序 ↑" },
  { op: "sort-lines-desc", label: "行排序 ↓" },
  { op: "reverse-lines", label: "行倒序" },
  { op: "reverse", label: "整段反转" },
];

export default function Text() {
  const [text, setText] = useState("");
  const [out, setOut] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    call<Stats>("text_stats", { text }).then(setStats).catch(() => setStats(null));
  }, [text]);

  async function apply(op: string) {
    try {
      setOut(await call<string>("text_transform", { text, op }));
    } catch {
      setOut("");
    }
  }

  return (
    <>
      <Card
        title="输入文本"
        right={
          stats && (
            <span className="muted" style={{ fontSize: 12 }}>
              {stats.chars} 字符 · {stats.words} 词 · {stats.lines} 行 · {stats.bytes} 字节
            </span>
          )
        }
      >
        <textarea
          className="textarea"
          rows={7}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="粘贴文本…"
          spellCheck={false}
        />
      </Card>

      <Card title="操作">
        <div className="row">
          {OPS.map((o) => (
            <button key={o.op} type="button" className="btn sm" onClick={() => apply(o.op)}>
              {o.label}
            </button>
          ))}
        </div>
      </Card>

      {out && (
        <Card title="结果" right={<CopyButton text={out} />}>
          <textarea className="textarea" rows={7} value={out} readOnly spellCheck={false} />
        </Card>
      )}
    </>
  );
}
