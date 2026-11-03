import { useEffect, useState } from "react";
import { call } from "../lib/api";
import { Card } from "../components/Card";
import { CopyButton } from "../components/CopyButton";

interface JwtParts {
  header: string;
  payload: string;
  signature: string;
  alg: string;
  error: string | null;
}

export default function Jwt() {
  const [token, setToken] = useState("");
  const [parts, setParts] = useState<JwtParts | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!token.trim()) {
        setParts(null);
        return;
      }
      call<JwtParts>("jwt_decode", { token }).then(setParts).catch(() => setParts(null));
    }, 150);
    return () => window.clearTimeout(id);
  }, [token]);

  return (
    <>
      <Card title="JWT">
        <textarea
          className="textarea"
          rows={5}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="粘贴 JWT（header.payload.signature）"
          spellCheck={false}
        />
        {parts?.error && <div className="err-box">{parts.error}</div>}
      </Card>

      {parts && !parts.error && (
        <>
          <Card title="Header" right={<CopyButton text={parts.header} />}>
            <pre className="code-block">{parts.header}</pre>
          </Card>
          <Card title="Payload" right={<CopyButton text={parts.payload} />}>
            <pre className="code-block">{parts.payload}</pre>
          </Card>
          <Card title="Signature">
            <div className="kv-grid">
              <span className="k">算法</span>
              <span className="v">{parts.alg}</span>
              <span />
              <span className="k">签名</span>
              <span className="v">{parts.signature}</span>
              <CopyButton text={parts.signature} />
            </div>
            <p className="hint">这里只做解码，不校验签名有效性。</p>
          </Card>
        </>
      )}
    </>
  );
}
