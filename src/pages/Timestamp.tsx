import { Fragment, useEffect, useState } from "react";
import { call } from "../lib/api";
import { pasteText } from "../lib/clipboard";
import { Clipboard, Trash2 } from "lucide-react";
import { relativeText } from "../lib/relative";
import { Card } from "../components/Card";
import { CopyButton } from "../components/CopyButton";
import type { TsResult } from "../lib/types";

export default function Timestamp() {
  const [input, setInput] = useState(() => String(Date.now()));
  const [res, setRes] = useState<TsResult | null>(null);
  const [bad, setBad] = useState(false);
  // 每秒走一格：输入「现在」之后相对时间要跟着变，不能停在打开页面那一刻
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let alive = true;
    const id = window.setTimeout(() => {
      call<TsResult>("convert_timestamp", { input })
        .then((r) => {
          if (!alive) return;
          setRes(r);
          setBad(r.millis === null);
        })
        .catch(() => {
          if (alive) setBad(true);
        });
    }, 90);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [input]);

  async function paste() {
    try {
      const t = await pasteText();
      if (t != null) setInput(t.trim());
    } catch {
      /* 剪贴板为空或没权限时静默 */
    }
  }

  return (
    <>
      <Card title="时间戳 / 日期">
        <div className="field-row">
          <input
            className="input mono"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="秒 / 毫秒时间戳，或 2026-11-02 15:00:00"
            spellCheck={false}
          />
          <div className="field-row__tail">
            <CopyButton text={input} />
            <button type="button" className="btn icon-only" onClick={paste} title="粘贴">
              <Clipboard size={15} />
            </button>
            <button
              type="button"
              className="btn icon-only"
              onClick={() => setInput("")}
              title="清空"
            >
              <Trash2 size={15} />
            </button>
            <button
              type="button"
              className="btn primary sm"
              onClick={() => setInput(String(Date.now()))}
            >
              现在
            </button>
          </div>
        </div>

        {bad && <div className="err-box">无法解析这个输入</div>}

        {res && res.units.length > 0 && (
          <div className="kv-grid" style={{ marginTop: 16 }}>
            {res.units.map((u) => (
              <Fragment key={u.label}>
                <span className="k">{u.label}</span>
                <span className="v">{u.value}</span>
                <CopyButton text={u.value} />
              </Fragment>
            ))}
          </div>
        )}
      </Card>

      {res && res.reps.length > 0 && (
        <Card title="同一时刻的其它表示">
          <div className="kv-grid">
            {res.reps.map((r) => {
              // 相对时间在前端实时算，其余用后端给的值
              const value =
                r.label === "相对现在" && res.millis != null
                  ? relativeText(res.millis, now)
                  : r.value;
              return (
                <Fragment key={r.label}>
                  <span className="k">{r.label}</span>
                  <span className="v">{value}</span>
                  <CopyButton text={value} />
                </Fragment>
              );
            })}
          </div>
        </Card>
      )}

      {res && res.zones.length > 0 && (
        <Card title="各时区">
          <div className="zone-grid">
            <span className="zh">时区</span>
            <span className="zh">偏移</span>
            <span className="zh">时间</span>
            <span className="zh">星期</span>
            <span />
            {res.zones.map((z) => (
              <Fragment key={z.id}>
                <span className="z-name" title={z.id}>
                  {z.name}
                </span>
                <span className="z-off">{z.offset}</span>
                <span className="z-time">{z.datetime}</span>
                <span className="z-wd">{z.weekday}</span>
                <CopyButton text={z.datetime} />
              </Fragment>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
