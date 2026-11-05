import { useEffect, useMemo, useState } from "react";
import { Card } from "../components/Card";
import { CopyButton } from "../components/CopyButton";
import { Segmented } from "../components/Segmented";
import { call } from "../lib/api";
import type { CronInfo } from "../lib/types";

type FieldKey = "sec" | "min" | "hour" | "dom" | "month" | "dow";
type FieldMode = "any" | "single" | "range" | "step" | "list";

interface FieldState {
  mode: FieldMode;
  a: number;
  b: number;
  step: number;
  list: string;
}

interface FieldDef {
  key: FieldKey;
  label: string;
  min: number;
  max: number;
  note?: string;
}

const DEFS: FieldDef[] = [
  { key: "sec", label: "秒", min: 0, max: 59, note: "6 段模式才有" },
  { key: "min", label: "分", min: 0, max: 59 },
  { key: "hour", label: "时", min: 0, max: 23 },
  { key: "dom", label: "日", min: 1, max: 31 },
  { key: "month", label: "月", min: 1, max: 12 },
  { key: "dow", label: "周", min: 0, max: 6, note: "0 = 周日" },
];

const DOW_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

const MODE_LABELS: { value: FieldMode; label: string }[] = [
  { value: "any", label: "任意值" },
  { value: "single", label: "单值" },
  { value: "range", label: "范围" },
  { value: "step", label: "步长" },
  { value: "list", label: "列表" },
];

const PRESETS: { label: string; expr: string }[] = [
  { label: "每分钟", expr: "* * * * *" },
  { label: "每 5 分钟", expr: "*/5 * * * *" },
  { label: "每小时", expr: "0 * * * *" },
  { label: "每天 09:00", expr: "0 9 * * *" },
  { label: "每周一 09:00", expr: "0 9 * * 1" },
  { label: "每月 1 号 00:00", expr: "0 0 1 * *" },
  { label: "工作日 09:00", expr: "0 9 * * 1-5" },
  { label: "每 30 秒（6 段）", expr: "*/30 * * * * *" },
];

function makeField(a: number, b: number): FieldState {
  return { mode: "any", a, b, step: 5, list: "" };
}

const INITIAL_FIELDS: Record<FieldKey, FieldState> = {
  sec: { ...makeField(0, 59), mode: "single", a: 0 },
  min: { ...makeField(0, 59), mode: "single", a: 0 },
  hour: { ...makeField(0, 23), mode: "single", a: 9 },
  dom: makeField(1, 31),
  month: makeField(1, 12),
  dow: makeField(0, 6),
};

function fieldValueLabel(def: FieldDef, v: number): string {
  if (def.key === "dow") return `${v}（${DOW_LABELS[v] ?? "?"}）`;
  if (def.key === "month") return `${v} 月`;
  if (def.key === "hour") return `${v} 点`;
  return String(v);
}

function buildToken(f: FieldState): string {
  switch (f.mode) {
    case "any":
      return "*";
    case "single":
      return String(f.a);
    case "range":
      return `${f.a}-${f.b}`;
    case "step":
      return `*/${Math.max(1, f.step)}`;
    case "list": {
      const parts = f.list
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      return parts.length ? parts.join(",") : "*";
    }
    default:
      return "*";
  }
}

function buildExpr(fields: Record<FieldKey, FieldState>, hasSix: boolean): string {
  const keys: FieldKey[] = hasSix
    ? ["sec", "min", "hour", "dom", "month", "dow"]
    : ["min", "hour", "dom", "month", "dow"];
  return keys.map((k) => buildToken(fields[k])).join(" ");
}

function parseToken(def: FieldDef, raw: string): FieldState {
  const base = makeField(def.min, def.max);
  const t = raw.trim();
  if (!t || t === "*") return base;
  if (t.startsWith("*/")) {
    const n = Number(t.slice(2));
    return { ...base, mode: "step", step: Number.isFinite(n) && n > 0 ? n : 5 };
  }
  if (t.includes(",")) return { ...base, mode: "list", list: t };
  if (t.includes("-")) {
    const [a, b] = t.split("-").map(Number);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return { ...base, mode: "range", a, b };
    }
    return { ...base, mode: "list", list: t };
  }
  const n = Number(t);
  if (Number.isFinite(n)) return { ...base, mode: "single", a: n };
  return { ...base, mode: "list", list: t };
}

function FieldEditor({
  def,
  state,
  onChange,
}: {
  def: FieldDef;
  state: FieldState;
  onChange: (patch: Partial<FieldState>) => void;
}) {
  const options = useMemo(() => {
    const arr = [];
    for (let i = def.min; i <= def.max; i++) arr.push(i);
    return arr;
  }, [def.min, def.max]);

  return (
    <div className="cron-field">
      <div className="cron-field__name">
        <span className="cron-field__label">{def.label}</span>
        <span className="cron-field__range">
          {def.min}–{def.max}
          {def.note ? ` · ${def.note}` : ""}
        </span>
      </div>
      <select
        className="input"
        value={state.mode}
        onChange={(e) => onChange({ mode: e.target.value as FieldMode })}
      >
        {MODE_LABELS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>

      <div className="cron-field__value">
        {state.mode === "any" && <span className="muted">任意值</span>}
        {state.mode === "single" && (
          <select
            className="input"
            value={state.a}
            onChange={(e) => onChange({ a: Number(e.target.value) })}
          >
            {options.map((v) => (
              <option key={v} value={v}>
                {fieldValueLabel(def, v)}
              </option>
            ))}
          </select>
        )}
        {state.mode === "range" && (
          <div className="cron-range">
            <select
              className="input"
              value={state.a}
              onChange={(e) => {
                const a = Number(e.target.value);
                onChange({ a, b: Math.max(state.b, a) });
              }}
            >
              {options.map((v) => (
                <option key={v} value={v}>
                  {fieldValueLabel(def, v)}
                </option>
              ))}
            </select>
            <span className="muted">至</span>
            <select
              className="input"
              value={state.b}
              onChange={(e) => {
                const b = Number(e.target.value);
                onChange({ b: Math.max(state.a, b) });
              }}
            >
              {options
                .filter((v) => v >= state.a)
                .map((v) => (
                  <option key={v} value={v}>
                    {fieldValueLabel(def, v)}
                  </option>
                ))}
            </select>
          </div>
        )}
        {state.mode === "step" && (
          <div className="cron-step">
            <span className="muted">每</span>
            <input
              className="input num"
              type="number"
              min={1}
              max={def.max}
              value={state.step}
              onChange={(e) => onChange({ step: Number(e.target.value) || 1 })}
            />
            <span className="muted">{def.label}一次</span>
          </div>
        )}
        {state.mode === "list" && (
          <input
            className="input mono"
            value={state.list}
            placeholder={
              def.key === "dow" ? "如 1,3,5（周一、三、五）" : `如 ${def.min},${def.min + 1},${def.min + 5}`
            }
            onChange={(e) => onChange({ list: e.target.value })}
          />
        )}
      </div>

      <code className="cron-field__token">{buildToken(state)}</code>
    </div>
  );
}

export default function Cron() {
  const [hasSix, setHasSix] = useState(false);
  const [fields, setFields] = useState<Record<FieldKey, FieldState>>(INITIAL_FIELDS);
  const [expr, setExpr] = useState("0 9 * * *");
  const [info, setInfo] = useState<CronInfo | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const id = window.setTimeout(async () => {
      if (!expr.trim()) {
        setInfo(null);
        setError("请输入 Cron 表达式");
        return;
      }
      try {
        const r = await call<CronInfo>("cron_explain", { expr });
        if (alive) {
          setInfo(r);
          setError("");
        }
      } catch (e) {
        if (alive) {
          setInfo(null);
          setError(typeof e === "string" ? e : e instanceof Error ? e.message : String(e));
        }
      }
    }, 180);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [expr]);

  function changeField(key: FieldKey, patch: Partial<FieldState>) {
    const next = { ...fields, [key]: { ...fields[key], ...patch } };
    setFields(next);
    setExpr(buildExpr(next, hasSix));
  }

  function changeMode(six: boolean) {
    setHasSix(six);
    setExpr(buildExpr(fields, six));
  }

  function applyPreset(preset: string) {
    const parts = preset.trim().split(/\s+/);
    const six = parts.length === 6;
    const keys: FieldKey[] = six
      ? ["sec", "min", "hour", "dom", "month", "dow"]
      : ["min", "hour", "dom", "month", "dow"];
    const next = { ...fields };
    keys.forEach((key, i) => {
      const def = DEFS.find((d) => d.key === key)!;
      next[key] = parseToken(def, parts[i]);
    });
    setHasSix(six);
    setFields(next);
    setExpr(parts.join(" "));
  }

  const visibleDefs = hasSix ? DEFS : DEFS.filter((d) => d.key !== "sec");

  return (
    <>
      <Card title="Cron 表达式" right={<CopyButton text={expr} />}>
        <div className="field-row">
          <input
            className="input mono"
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
            placeholder="如 0 9 * * * 或 */30 * * * * *"
            spellCheck={false}
          />
        </div>
        <div className="row panel-actions">
          <Segmented
            value={hasSix ? "6" : "5"}
            options={[
              { value: "5", label: "5 段（Linux crontab）" },
              { value: "6", label: "6 段（带秒）" },
            ]}
            onChange={(v) => changeMode(v === "6")}
          />
          <span className="hint panel-hint">
            5 段 = 分 时 日 月 周；6 段在首位增加秒，属于 Quartz / Spring 扩展，标准 Linux
            crontab 不支持秒字段。周字段 0 / 7 都表示周日。
          </span>
        </div>
        <div className="row preset-row">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="btn sm"
              title={p.expr}
              onClick={() => applyPreset(p.expr)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="hint">
          直接编辑上面的表达式即可解析；点预设会同时把表达式和下方生成器一起填好。
        </div>
      </Card>

      <Card title="中文回显">
        {error ? (
          <div className="err-box">{error}</div>
        ) : info ? (
          <>
            <div className="cron-desc">{info.description}</div>
            <div className="hint">
              规整后：<span className="mono">{info.normalized}</span> · {info.fields} 段
            </div>
          </>
        ) : (
          <div className="code-empty">等待解析…</div>
        )}
      </Card>

      <Card
        title="按字段生成"
        right={
          <Segmented
            value={hasSix ? "6" : "5"}
            options={[
              { value: "5", label: "5 段" },
              { value: "6", label: "6 段" },
            ]}
            onChange={(v) => changeMode(v === "6")}
          />
        }
      >
        <div className="cron-fields">
          <span className="cron-field__head">字段</span>
          <span className="cron-field__head">模式</span>
          <span className="cron-field__head">取值</span>
          <span className="cron-field__head">片段</span>
          {visibleDefs.map((def) => (
            <FieldEditor
              key={def.key}
              def={def}
              state={fields[def.key]}
              onChange={(patch) => changeField(def.key, patch)}
            />
          ))}
        </div>
        <div className="hint">
          表达式：<span className="mono">{expr}</span>
          {hasSix ? "（6 段：秒 分 时 日 月 周）" : "（5 段：分 时 日 月 周）"}
        </div>
      </Card>

      <Card title="字段速查">
        <div className="cron-help">
          <div>
            <strong>任意值</strong>：<code>*</code>，表示该字段所有取值。
          </div>
          <div>
            <strong>单值 / 范围 / 步长 / 列表</strong>：<code>5</code>、<code>1-5</code>、
            <code>{"*/5"}</code>、<code>1,3,5</code>。
          </div>
          <div>
            <strong>日与周</strong>：两者都受限时，Linux crontab 语义是「两者任一满足」即执行。
          </div>
          <div>
            <strong>月份 / 星期名</strong>：解析支持 <code>JAN-DEC</code> 与
            <code>SUN-SAT</code> 缩写；生成器输出数字。
          </div>
        </div>
      </Card>
    </>
  );
}
