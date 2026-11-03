import { Fragment, useEffect, useState } from "react";
import { call } from "../lib/api";
import { Card } from "../components/Card";
import { CopyButton } from "../components/CopyButton";
import { Segmented } from "../components/Segmented";
import type { HashResult } from "../lib/types";
import { usePref } from "../lib/prefs";

const ALGOS = ["md5", "sha1", "sha256", "sha512", "sm3", "fnv1a32", "fnv1a64"];

/** 展示名和页头描述里的写法保持一致 */
const LABELS: Record<string, string> = {
  md5: "MD5",
  sha1: "SHA-1",
  sha256: "SHA-256",
  sha512: "SHA-512",
  sm3: "SM3",
  fnv1a32: "FNV-1a 32",
  fnv1a64: "FNV-1a 64",
};

const algoLabel = (a: string) => LABELS[a] ?? a.toUpperCase();

export default function Hash() {
  const [text, setText] = useState("");
  const [upper, setUpper] = usePref("hash.upper", false);
  const [res, setRes] = useState<HashResult[]>([]);

  // 密钥不落盘：localStorage 是明文的，留着等于把密钥写在磁盘上
  const [key, setKey] = useState("");
  const [algo, setAlgo] = usePref("hash.algo", "sha256");
  const [hmac, setHmac] = useState("");

  useEffect(() => {
    const id = window.setTimeout(() => {
      call<HashResult[]>("hash_text", { text, algos: ALGOS, upper })
        .then(setRes)
        .catch(() => setRes([]));
    }, 100);
    return () => window.clearTimeout(id);
  }, [text, upper]);

  useEffect(() => {
    if (!key) {
      setHmac("");
      return;
    }
    const id = window.setTimeout(() => {
      call<string>("hmac_text", { text, key, algo, upper })
        .then(setHmac)
        .catch(() => setHmac(""));
    }, 120);
    return () => window.clearTimeout(id);
  }, [text, key, algo, upper]);

  return (
    <>
      <Card title="输入文本">
        <textarea
          className="textarea"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="要计算哈希的文本…"
          spellCheck={false}
        />
        <label className="check" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={upper} onChange={(e) => setUpper(e.target.checked)} />
          大写输出
        </label>
      </Card>

      <Card title="哈希值">
        <div className="kv-grid">
          {res.map((r) => (
            <Fragment key={r.algo}>
              <span className="k">{algoLabel(r.algo)}</span>
              <span className="v">{r.output}</span>
              <CopyButton text={r.output} />
            </Fragment>
          ))}
        </div>
        <p className="hint">
          SM3 是国密标准（GM/T 0004-2012）；FNV-1a 为非加密哈希，适合去重、分桶、缓存键，
          不要用于密码或签名。
        </p>
      </Card>

      <Card title="HMAC" right={<Segmented value={algo} onChange={setAlgo} options={[
        { value: "sha1", label: "SHA-1" },
        { value: "sha256", label: "SHA-256" },
        { value: "sha512", label: "SHA-512" },
      ]} />}>
        <input
          className="input"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="密钥（填了才算 HMAC）"
          spellCheck={false}
        />
        {key && (
          <div className="kv-grid" style={{ marginTop: 14 }}>
            <span className="k">HMAC</span>
            <span className="v">{hmac}</span>
            <CopyButton text={hmac} />
          </div>
        )}
      </Card>
    </>
  );
}
