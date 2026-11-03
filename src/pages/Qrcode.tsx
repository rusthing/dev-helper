import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { Card } from "../components/Card";
import { call, IS_TAURI } from "../lib/api";

export default function Qrcode() {
  const [text, setText] = useState("");
  const [svg, setSvg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!text.trim()) {
        setSvg("");
        setErr("");
        return;
      }
      call<string>("qr_svg", {
        text,
        size: 260,
        dark: "#111418",
        light: "#ffffff",
      })
        .then((s) => {
          setSvg(s);
          setErr("");
        })
        .catch((e) => {
          setSvg("");
          setErr(String(e));
        });
    }, 160);
    return () => window.clearTimeout(id);
  }, [text]);

  async function savePng() {
    if (!IS_TAURI) {
      setErr("保存图片需要在桌面应用里操作");
      return;
    }
    try {
      const path = await save({
        defaultPath: "qrcode.png",
        filters: [{ name: "PNG 图片", extensions: ["png"] }],
      });
      if (!path) return;
      await call("save_qr", { text, path, size: 512 });
      setErr("");
    } catch (e) {
      setErr(String(e));
    }
  }

  return (
    <>
      <Card title="内容">
        <textarea
          className="textarea"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="输入网址或任意文本…"
          spellCheck={false}
        />
        {err && <div className="err-box">{err}</div>}
      </Card>

      <Card
        title="二维码"
        right={
          <button type="button" className="btn sm" onClick={savePng} disabled={!svg}>
            <Download size={13} /> 保存 PNG
          </button>
        }
      >
        {svg ? (
          <div className="qr-wrap">
            <div className="qr-box" dangerouslySetInnerHTML={{ __html: svg }} />
          </div>
        ) : (
          <div className="qr-empty muted">输入内容后这里会出现二维码</div>
        )}
      </Card>
    </>
  );
}
