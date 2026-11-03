import { Fragment, useEffect, useState } from "react";
import { call } from "../lib/api";
import { Card } from "../components/Card";
import { CopyButton } from "../components/CopyButton";
import { Segmented } from "../components/Segmented";
import { usePref } from "../lib/prefs";

interface UrlParts {
  scheme: string;
  host: string;
  port: string;
  path: string;
  fragment: string;
  query: [string, string][];
  error: string | null;
}

type Mode = "encode" | "decode";

export default function Url() {
  const [text, setText] = useState("");
  const [mode, setMode] = usePref<Mode>("url.mode", "encode");
  const [out, setOut] = useState("");
  const [parts, setParts] = useState<UrlParts | null>(null);

  useEffect(() => {
    const id = window.setTimeout(async () => {
      if (!text) {
        setOut("");
        setParts(null);
        return;
      }
      try {
        setOut(
          mode === "encode"
            ? await call<string>("url_encode", { text })
            : await call<string>("url_decode", { text }),
        );
      } catch {
        setOut("");
      }
    }, 110);
    return () => window.clearTimeout(id);
  }, [text, mode]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      call<UrlParts>("url_parse", { text }).then(setParts).catch(() => setParts(null));
    }, 160);
    return () => window.clearTimeout(id);
  }, [text]);

  return (
    <>
      <Card
        title="输入"
        right={
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "encode", label: "编码" },
              { value: "decode", label: "解码" },
            ]}
          />
        }
      >
        <textarea
          className="textarea"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="输入 URL 或要编码的文本…"
          spellCheck={false}
        />
      </Card>

      <Card title="结果" right={<CopyButton text={out} />}>
        <textarea className="textarea" rows={3} value={out} readOnly spellCheck={false} />
      </Card>

      {parts && !parts.error && (
        <Card title="URL 拆解">
          <div className="kv-grid">
            {[
              ["协议", parts.scheme],
              ["主机", parts.host],
              ["端口", parts.port],
              ["路径", parts.path],
              ["片段", parts.fragment],
            ].map(([k, v]) => (
              <Fragment key={k}>
                <span className="k">{k}</span>
                <span className="v">{v || "—"}</span>
                <CopyButton text={v} />
              </Fragment>
            ))}
          </div>
        </Card>
      )}

      {parts && parts.query.length > 0 && (
        <Card title="查询参数">
          <div className="kv-grid">
            {parts.query.map(([k, v], i) => (
              <Fragment key={`${k}-${i}`}>
                <span className="k">{k}</span>
                <span className="v">{v}</span>
                <CopyButton text={v} />
              </Fragment>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
