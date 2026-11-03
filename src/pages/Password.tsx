import { Fragment, useEffect, useState } from "react";
import { call } from "../lib/api";
import { RefreshCw } from "lucide-react";
import { Card } from "../components/Card";
import { CopyButton } from "../components/CopyButton";
import { usePref } from "../lib/prefs";

const LEN_MIN = 4;
const LEN_MAX = 256;

/**
 * 常用档位。
 *
 * 这些数原来是滑块的刻度（`<datalist>`），Chrome 会把拖动吸附到最近的刻度上，
 * 手感很黏；而且 6 / 8 / 16 / 24 挤在轨道最左端，看着像渲染错位。
 * 改成独立按钮后：要跳就点，拖滑块则是连续的整数，不会被吸走。
 */
const LEN_PRESETS = [6, 8, 16, 24, 32, 64, 128, 256];

/**
 * 数字输入框：输入过程中不打断，失焦或回车才归一到合法范围。
 *
 * 如果 onChange 里直接 clamp，想输 128 会先输 "1" 被抬到最小值 4，
 * 接着输 "2" 就变成 42 —— 只能靠上下箭头一点点加。
 */
function NumberField({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState(() => String(value));

  // 拖动滑块或外部改动时同步回输入框
  useEffect(() => setDraft(String(value)), [value]);

  // 用事件里的实际值，而不是渲染闭包里的 draft：粘贴、输入法上屏这类
  // 绕过 onChange 的赋值，闭包里的 draft 可能是旧的，夹取结果就会算错。
  function commit(raw: string, el?: HTMLInputElement) {
    const n = Number(raw);
    const next =
      raw.trim() === "" || !Number.isFinite(n)
        ? value
        : Math.min(max, Math.max(min, Math.round(n)));
    // 归一结果与当前 state 相同时 React 不会重渲染，得手动把 DOM 拉回来，
    // 否则框里会留着那个越界的值。
    if (el && el.value !== String(next)) el.value = String(next);
    setDraft(String(next));
    if (next !== value) onChange(next);
  }

  return (
    <input
      className="input num"
      inputMode="numeric"
      value={draft}
      onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
      onBlur={(e) => commit(e.currentTarget.value, e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit(e.currentTarget.value, e.currentTarget);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

export default function Password() {
  // 生成参数记住，下次打开还是这套；结果本身不记，每次重新算
  const [length, setLength] = usePref("password.length", 20);
  const [upper, setUpper] = usePref("password.upper", true);
  const [lower, setLower] = usePref("password.lower", true);
  const [digits, setDigits] = usePref("password.digits", true);
  const [symbols, setSymbols] = usePref("password.symbols", true);
  const [avoidAmbiguous, setAvoidAmbiguous] = usePref("password.avoidAmbiguous", true);
  const [count, setCount] = usePref("password.count", 3);
  const [list, setList] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [seed, setSeed] = useState(0);

  useEffect(() => {
    call<string[]>("gen_password", {
      length,
      upper,
      lower,
      digits,
      symbols,
      count,
      avoidAmbiguous,
    })
      .then((r) => {
        setList(r);
        setErr("");
      })
      .catch((e) => {
        setList([]);
        setErr(String(e));
      });
  }, [length, upper, lower, digits, symbols, avoidAmbiguous, count, seed]);

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
        <div className="row" style={{ marginBottom: 8 }}>
          <label className="check">
            长度
            <NumberField value={length} min={LEN_MIN} max={LEN_MAX} onChange={setLength} />
          </label>
          <input
            type="range"
            min={LEN_MIN}
            max={LEN_MAX}
            value={length}
            onChange={(e) => setLength(Number(e.target.value))}
            style={{ flex: 1, maxWidth: 360, minWidth: 140 }}
            aria-label="密码长度"
          />
          <label className="check">
            数量
            <NumberField value={count} min={1} max={20} onChange={setCount} />
          </label>
        </div>
        <div className="len-presets">
          {LEN_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              className={`len-chip${length === n ? " on" : ""}`}
              onClick={() => setLength(n)}
              title={`长度 ${n}`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="row">
          <label className="check">
            <input type="checkbox" checked={lower} onChange={(e) => setLower(e.target.checked)} />
            小写 a-z
          </label>
          <label className="check">
            <input type="checkbox" checked={upper} onChange={(e) => setUpper(e.target.checked)} />
            大写 A-Z
          </label>
          <label className="check">
            <input type="checkbox" checked={digits} onChange={(e) => setDigits(e.target.checked)} />
            数字 0-9
          </label>
          <label className="check">
            <input type="checkbox" checked={symbols} onChange={(e) => setSymbols(e.target.checked)} />
            符号 !@#$
          </label>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <label className="check">
            <input
              type="checkbox"
              checked={avoidAmbiguous}
              onChange={(e) => setAvoidAmbiguous(e.target.checked)}
            />
            排除易混字符
            <span className="mono muted">0 O 1 l I</span>
          </label>
        </div>
        <p className="hint">
          {avoidAmbiguous
            ? "适合手抄或口述：不会出现容易看错的 0 / O / 1 / l / I，代价是字符池变小、同长度熵略低。"
            : "使用完整字符集，同长度熵更高，但 0 与 O、1 与 l / I 容易看错。"}
        </p>
      </Card>

      <Card title="生成结果" right={<CopyButton text={list.join("\n")} />}>
        {err ? (
          <div className="err-box">{err}</div>
        ) : (
          <div className="pass-grid">
            {list.map((p) => (
              <Fragment key={p}>
                <span className="v">{p}</span>
                <CopyButton text={p} />
              </Fragment>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
