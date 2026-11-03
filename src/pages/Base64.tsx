import { useEffect, useState } from "react";
import { call } from "../lib/api";
import { Card } from "../components/Card";
import { CopyButton } from "../components/CopyButton";
import { Segmented } from "../components/Segmented";
import { usePref } from "../lib/prefs";

type Mode = "encode" | "decode";

export default function Base64() {
  const [text, setText] = useState("");
  const [mode, setMode] = usePref<Mode>("base64.mode", "encode");
  const [urlSafe, setUrlSafe] = usePref("base64.urlSafe", false);
  const [noPad, setNoPad] = usePref("base64.noPad", false);
  const [out, setOut] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    const id = window.setTimeout(async () => {
      if (!text) {
        setOut("");
        setErr("");
        return;
      }
      try {
        const r =
          mode === "encode"
            ? await call<string>("base64_encode", { text, urlSafe, noPad })
            : await call<string>("base64_decode", { text, urlSafe });
        setOut(r);
        setErr("");
      } catch (e) {
        setOut("");
        setErr(String(e));
      }
    }, 110);
    return () => window.clearTimeout(id);
  }, [text, mode, urlSafe, noPad]);

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
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={mode === "encode" ? "要编码的文本…" : "粘贴 Base64…"}
          spellCheck={false}
        />
        <div className="row" style={{ marginTop: 10 }}>
          <label className="check">
            <input
              type="checkbox"
              checked={urlSafe}
              onChange={(e) => setUrlSafe(e.target.checked)}
            />
            URL 安全字符（- _）
          </label>
          {mode === "encode" && (
            <label className="check">
              <input type="checkbox" checked={noPad} onChange={(e) => setNoPad(e.target.checked)} />
              去掉末尾 =
            </label>
          )}
        </div>
      </Card>

      <Card title="结果" right={<CopyButton text={out} />}>
        {err ? (
          <div className="err-box">{err}</div>
        ) : (
          <textarea className="textarea" rows={6} value={out} readOnly spellCheck={false} />
        )}
      </Card>
    </>
  );
}
