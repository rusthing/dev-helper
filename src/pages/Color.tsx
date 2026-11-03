import { Fragment, useEffect, useState } from "react";
import { X } from "lucide-react";
import { call } from "../lib/api";
import { Card } from "../components/Card";
import { CopyButton } from "../components/CopyButton";
import { needsDarkText } from "../lib/color";
import { usePref } from "../lib/prefs";

interface ColorInfo {
  hex: string;
  hex8: string;
  rgb: string;
  hsl: string;
  r: number;
  g: number;
  b: number;
  a: number;
  error: string | null;
}

interface Preset {
  name: string;
  hex: string;
}

/**
 * 常见颜色：八个主色 + 七级灰阶 + 几个高频的 UI 色。
 * 灰阶夹在中间是刻意的——调边框、调阴影时最常回来翻的就是这一列。
 */
const PRESETS: Preset[] = [
  { name: "红", hex: "#f5222d" },
  { name: "橙", hex: "#fa8c16" },
  { name: "黄", hex: "#fadb14" },
  { name: "绿", hex: "#52c41a" },
  { name: "青", hex: "#13c2c2" },
  { name: "蓝", hex: "#1677ff" },
  { name: "紫", hex: "#722ed1" },
  { name: "洋红", hex: "#eb2f96" },
  { name: "黑", hex: "#000000" },
  { name: "深灰", hex: "#333333" },
  { name: "中灰", hex: "#666666" },
  { name: "浅灰", hex: "#999999" },
  { name: "银", hex: "#cccccc" },
  { name: "米白", hex: "#f5f5f5" },
  { name: "白", hex: "#ffffff" },
  { name: "品牌蓝", hex: "#5b6cff" },
  { name: "翠绿", hex: "#10b981" },
  { name: "琥珀", hex: "#f59e0b" },
  { name: "珊瑚", hex: "#ef4444" },
  { name: "石板灰", hex: "#64748b" },
];

/** 色块上的字跟着底色走，否则黄色底配白字就看不见了 */
const inkOf = (hex: string) => (needsDarkText(hex) ? "#15181e" : "#ffffff");

export default function Color() {
  const [input, setInput] = usePref("color.current", "#5b6cff");
  const [info, setInfo] = useState<ColorInfo | null>(null);
  const [ratio, setRatio] = useState<number | null>(null);

  // 收藏只存 hex：换算法不用迁数据
  const [fav, setFav] = usePref<string[]>("color.favorites", []);

  useEffect(() => {
    call<ColorInfo>("color_parse", { input }).then(setInfo).catch(() => setInfo(null));
  }, [input]);

  useEffect(() => {
    if (!info || info.error) {
      setRatio(null);
      return;
    }
    call<number>("contrast_ratio", { fg: info.hex, bg: "#ffffff" })
      .then(setRatio)
      .catch(() => setRatio(null));
  }, [info]);

  const current = info && !info.error ? info.hex : "";

  const addFav = () => {
    if (!current || fav.includes(current)) return;
    setFav([current, ...fav]);
  };

  return (
    <>
      <Card title="颜色值">
        <div className="field-row">
          <input
            className="input mono"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="#5b6cff、rgb(91,108,255)、#f00"
            spellCheck={false}
          />
          <div className="swatch" style={{ background: current || "transparent" }} />
        </div>
        {info?.error && <div className="err-box">{info.error}</div>}

        <div className="pick-block">
          <div className="pick-block__head">
            <span className="pick-block__label">常见颜色</span>
          </div>
          <div className="color-picks">
            {PRESETS.map(({ name, hex }) => (
              <button
                key={hex}
                type="button"
                className={`color-pick${current === hex ? " on" : ""}`}
                style={{ background: hex, color: inkOf(hex) }}
                onClick={() => setInput(hex)}
                title={`${name} ${hex}`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        <div className="pick-block">
          <div className="pick-block__head">
            <span className="pick-block__label">我的颜色</span>
            <button
              type="button"
              className="btn sm"
              onClick={addFav}
              disabled={!current || fav.includes(current)}
              title={fav.includes(current) ? "这个颜色已经收藏过了" : `把 ${current} 记到下面`}
            >
              收藏当前颜色
            </button>
          </div>
          <div className="color-picks">
            {fav.length === 0 ? (
              <span className="hint" style={{ margin: 0 }}>
                还没有收藏。调出一个顺手的颜色后点右边「收藏当前颜色」，下次打开还在。
              </span>
            ) : (
              fav.map((hex) => (
                <div
                  key={hex}
                  className={`color-pick color-pick--fav${current === hex ? " on" : ""}`}
                  style={{ background: hex, color: inkOf(hex) }}
                >
                  <button
                    type="button"
                    className="color-pick__hit"
                    onClick={() => setInput(hex)}
                    title={`用 ${hex}`}
                  >
                    {hex}
                  </button>
                  <button
                    type="button"
                    className="color-pick__del"
                    onClick={() => setFav(fav.filter((v) => v !== hex))}
                    title="删除"
                    aria-label="删除"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </Card>

      {info && !info.error && (
        <>
          <Card title="各种写法">
            <div className="kv-grid">
              {[
                ["HEX", info.hex],
                ["HEX8", info.hex8],
                ["RGB", info.rgb],
                ["HSL", info.hsl],
              ].map(([k, v]) => (
                <Fragment key={k}>
                  <span className="k">{k}</span>
                  <span className="v">{v}</span>
                  <CopyButton text={v} />
                </Fragment>
              ))}
            </div>
          </Card>

          <Card title="在白色背景上的对比度">
            <div className="kv-grid">
              <span className="k">对比度</span>
              <span className="v">{ratio ? `${ratio.toFixed(2)} : 1` : "—"}</span>
              <span />
              <span className="k">WCAG</span>
              <span className="v">
                {ratio == null
                  ? "—"
                  : ratio >= 7
                    ? "AAA 通过"
                    : ratio >= 4.5
                      ? "AA 通过"
                      : ratio >= 3
                        ? "仅大字号可用"
                        : "不达标"}
              </span>
              <span />
            </div>
          </Card>
        </>
      )}
    </>
  );
}
