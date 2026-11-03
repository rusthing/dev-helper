import { useEffect, useState } from "react";
import { call } from "../lib/api";
import { RefreshCw } from "lucide-react";
import { Card } from "../components/Card";
import { CopyButton } from "../components/CopyButton";
import { Segmented } from "../components/Segmented";
import { usePref } from "../lib/prefs";

export default function Uuid() {
  const [count, setCount] = usePref("uuid.count", 5);
  const [ver, setVer] = usePref<"v4" | "v7">("uuid.ver", "v4");
  const [upper, setUpper] = usePref("uuid.upper", false);
  const [hyphens, setHyphens] = usePref("uuid.hyphens", true);
  const [braces, setBraces] = usePref("uuid.braces", false);
  const [list, setList] = useState<string[]>([]);
  const [seed, setSeed] = useState(0);

  useEffect(() => {
    call<string[]>("gen_uuid", { count, v7: ver === "v7", upper, braces, hyphens })
      .then(setList)
      .catch(() => setList([]));
  }, [count, ver, upper, hyphens, braces, seed]);

  return (
    <>
      <Card
        title="生成设置"
        right={
          <button type="button" className="btn sm" onClick={() => setSeed((s) => s + 1)}>
            <RefreshCw size={13} /> 重新生成
          </button>
        }
      >
        <div className="row">
          <Segmented
            value={ver}
            onChange={setVer}
            options={[
              { value: "v4", label: "v4 随机" },
              { value: "v7", label: "v7 时间序" },
            ]}
          />
          <label className="check">
            数量
            <input
              className="input num"
              type="number"
              min={1}
              max={200}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
            />
          </label>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <label className="check">
            <input type="checkbox" checked={upper} onChange={(e) => setUpper(e.target.checked)} />
            大写
          </label>
          <label className="check">
            <input type="checkbox" checked={hyphens} onChange={(e) => setHyphens(e.target.checked)} />
            带连字符
          </label>
          <label className="check">
            <input type="checkbox" checked={braces} onChange={(e) => setBraces(e.target.checked)} />
            加花括号
          </label>
        </div>
      </Card>

      <Card title="结果" right={<CopyButton text={list.join("\n")} />}>
        <div className="kv-grid uuid-grid">
          {list.map((u, i) => (
            <div key={u} className="uuid-row">
              <span className="k">{i + 1}</span>
              <span className="v">{u}</span>
              <CopyButton text={u} />
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
