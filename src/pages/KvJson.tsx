import { useEffect, useState } from "react";
import { call } from "../lib/api";
import { Clipboard, Sparkles, Trash2 } from "lucide-react";
import { pasteText } from "../lib/clipboard";
import { Card } from "../components/Card";
import { CopyButton } from "../components/CopyButton";

interface KvResult {
  tree: string;
  json: string;
}

/** Debezium 那种一行到底的日志，直接拿来做示例最有说服力 */
const SAMPLE = `{op=r, before=null, ts_us=1793591560781557, after={ORG_ID=null, IS_DELETED=0, REALM_ID=LOGISTICS-DRIVER, ID=2855, NAME=周礼明, ID_CARD=450122196110283019, IS_TESTER=0}, source={connector=mysql, db=adm, table=ADM_USER, version=3.0.1.Final, pos=3909408, snapshot=true}, transaction=null, ts_ms=1793591560781}`;

export default function KvJson() {
  const [text, setText] = useState("");
  const [res, setRes] = useState<KvResult | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!text.trim()) {
        setRes(null);
        setErr("");
        return;
      }
      call<KvResult>("kv_to_json", { input: text })
        .then((r) => {
          setRes(r);
          setErr("");
        })
        .catch((e) => {
          setRes(null);
          setErr(String(e));
        });
    }, 120);
    return () => window.clearTimeout(id);
  }, [text]);

  async function paste() {
    try {
      const t = await pasteText();
      if (t != null) setText(t.trim());
    } catch {
      /* 剪贴板为空或没权限时静默 */
    }
  }

  return (
    <>
      <Card
        title="键值文本"
        right={
          <>
            <button type="button" className="btn icon-only" onClick={paste} title="粘贴">
              <Clipboard size={15} />
            </button>
            <button
              type="button"
              className="btn icon-only"
              onClick={() => setText("")}
              disabled={!text}
              title="清空"
            >
              <Trash2 size={15} />
            </button>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setText(SAMPLE)}
              title="填入示例"
            >
              <Sparkles size={13} /> 示例
            </button>
          </>
        }
      >
        <textarea
          className="textarea mono"
          rows={7}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="{op=r, before=null, after={ID=2855, NAME=周礼明}, ts_ms=1793591560781}"
          spellCheck={false}
        />
        <p className="hint">
          键不用引号、值不用引号也能解析；嵌套花括号会还原成层级。
          超过 2^53 的整数（身份证号、雪花 ID）在 JSON 里按字符串输出，避免 JS 解析时丢精度。
        </p>
      </Card>

      {err && <div className="err-box">{err}</div>}

      {res && (
        <>
          <Card title="缩进视图" right={<CopyButton text={res.tree} />}>
            <pre className="code-block">{res.tree}</pre>
          </Card>
          <Card title="JSON" right={<CopyButton text={res.json} />}>
            <pre className="code-block">{res.json}</pre>
          </Card>
        </>
      )}
    </>
  );
}
