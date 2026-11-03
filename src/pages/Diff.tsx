import { useEffect, useState } from "react";
import { call } from "../lib/api";
import { Card } from "../components/Card";

interface DiffLine {
  tag: "equal" | "insert" | "delete";
  old_no: number | null;
  new_no: number | null;
  text: string;
}

interface DiffResult {
  lines: DiffLine[];
  summary: { added: number; removed: number; unchanged: number };
}

export default function Diff() {
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [res, setRes] = useState<DiffResult | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!left && !right) {
        setRes(null);
        return;
      }
      call<DiffResult>("text_diff", { left, right }).then(setRes).catch(() => setRes(null));
    }, 180);
    return () => window.clearTimeout(id);
  }, [left, right]);

  return (
    <>
      <div className="diff-inputs">
        <Card title="原文">
          <textarea
            className="textarea"
            rows={7}
            value={left}
            onChange={(e) => setLeft(e.target.value)}
            placeholder="粘贴原始文本…"
            spellCheck={false}
          />
        </Card>
        <Card title="新文本">
          <textarea
            className="textarea"
            rows={7}
            value={right}
            onChange={(e) => setRight(e.target.value)}
            placeholder="粘贴修改后的文本…"
            spellCheck={false}
          />
        </Card>
      </div>

      {res && (
        <Card
          title="对比结果"
          right={
            <div className="row">
              <span className="badge" style={{ background: "#18a05820", color: "#18a058" }}>
                +{res.summary.added}
              </span>
              <span className="badge" style={{ background: "#f53f3f20", color: "#f53f3f" }}>
                -{res.summary.removed}
              </span>
            </div>
          }
        >
          <div className="diff-list">
            {res.lines.map((l, i) => (
              <div key={i} className={`diff-line ${l.tag}`}>
                <span className="no">{l.old_no ?? ""}</span>
                <span className="no">{l.new_no ?? ""}</span>
                <span className="sign">
                  {l.tag === "insert" ? "+" : l.tag === "delete" ? "-" : " "}
                </span>
                <span className="txt">{l.text || " "}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
