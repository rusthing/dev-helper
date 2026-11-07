import { useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { Card } from "../components/Card";
import { CopyButton } from "../components/CopyButton";
import { Segmented } from "../components/Segmented";
import { Tabs, type TabItem } from "../components/Tabs";
import { call } from "../lib/api";
import { useTabUsage } from "../lib/tabUsage";

type TabId =
  | "base64"
  | "url"
  | "radix"
  | "jy"
  | "jx"
  | "kv"
  | "unicode"
  | "rmb";

const TABS: TabItem<TabId>[] = [
  { id: "base64", label: "Base64" },
  { id: "url", label: "URL" },
  { id: "radix", label: "进制" },
  { id: "jy", label: "JSON ↔ YAML" },
  { id: "jx", label: "JSON ↔ XML" },
  { id: "kv", label: "键值 → JSON" },
  { id: "unicode", label: "Unicode" },
  { id: "rmb", label: "人民币大写" },
];

function errText(e: unknown): string {
  return typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
}

/** 转换面板的公共骨架：模式切换 + 输入 + 结果，状态留在各自面板里。 */
function ConvertPanel({
  sample,
  placeholder,
  modes,
  initialMode,
  run,
  options,
  hint,
  rows = 5,
  runLabel = "转换",
}: {
  sample: string;
  placeholder: string;
  modes?: { value: string; label: string }[];
  initialMode?: string;
  run: (input: string, mode: string) => Promise<string>;
  options?: (mode: string) => ReactNode;
  hint?: ReactNode;
  rows?: number;
  runLabel?: string;
}) {
  const [mode, setMode] = useState(initialMode ?? modes?.[0]?.value ?? "one");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function exec() {
    if (!input.trim()) {
      setOutput("");
      setError("");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setOutput(await run(input, mode));
    } catch (e) {
      setOutput("");
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card
        title="输入"
        right={
          modes && (
            <Segmented
              value={mode}
              options={modes.map((m) => ({ value: m.value, label: m.label }))}
              onChange={setMode}
            />
          )
        }
      >
        <textarea
          className="textarea"
          rows={rows}
          value={input}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(e) => setInput(e.target.value)}
        />
        {options && <div className="option-row">{options(mode)}</div>}
        <div className="row panel-actions">
          <button type="button" className="btn primary" disabled={busy} onClick={exec}>
            {busy ? "处理中…" : runLabel}
          </button>
          <button type="button" className="btn ghost" onClick={() => setInput(sample)}>
            示例
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setInput("");
              setOutput("");
              setError("");
            }}
          >
            <Trash2 size={14} />
            清空
          </button>
          {hint && <span className="hint panel-hint">{hint}</span>}
        </div>
        {error && <div className="err-box">{error}</div>}
      </Card>

      <Card title="结果" right={<CopyButton text={output} />}>
        {output ? (
          <pre className="code-block">{output}</pre>
        ) : (
          <div className="code-empty">转换结果会显示在这里</div>
        )}
      </Card>
    </>
  );
}

function Base64Tab() {
  const [urlSafe, setUrlSafe] = useState(false);
  const [noPad, setNoPad] = useState(false);

  return (
    <ConvertPanel
      sample="dev-helper：离线开发小工具"
      placeholder="粘贴要编码的文本，或要解码的 Base64"
      modes={[
        { value: "encode", label: "编码" },
        { value: "decode", label: "解码" },
      ]}
      hint="解码会自动忽略换行与空白；URL 安全模式把 +/ 换成 -_。"
      options={(mode) =>
        mode === "encode" ? (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={urlSafe}
                onChange={(e) => setUrlSafe(e.target.checked)}
              />
              URL 安全字符集
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={noPad}
                onChange={(e) => setNoPad(e.target.checked)}
              />
              去掉末尾 =
            </label>
          </>
        ) : null
      }
      run={(text, mode) =>
        mode === "encode"
          ? call<string>("base64_encode", { text, urlSafe, noPad })
          : call<string>("base64_decode", { text, urlSafe })
      }
    />
  );
}

function UrlTab() {
  return (
    <ConvertPanel
      sample={"https://example.com/搜索?q=dev helper&lang=zh-CN"}
      placeholder="粘贴文本或 URL"
      modes={[
        { value: "encode", label: "编码" },
        { value: "decode", label: "解码" },
      ]}
      hint="编码采用 RFC 3986 的 fragment 安全集；解码失败时保留原文。"
      run={(text, mode) =>
        mode === "encode"
          ? call<string>("url_encode", { text })
          : call<string>("url_decode", { text })
      }
    />
  );
}

function RadixTab() {
  return (
    <ConvertPanel
      sample="255"
      placeholder="输入数字，可带与来源进制一致的 0b / 0o / 0x 前缀"
      modes={[
        { value: "2", label: "2 进制" },
        { value: "8", label: "8 进制" },
        { value: "10", label: "10 进制" },
        { value: "16", label: "16 进制" },
      ]}
      hint="支持负数，范围按 i128 校验；结果同时给出 2 / 8 / 10 / 16 进制。"
      run={async (input, mode) => {
        const r = await call<{
          decimal: string;
          binary: string;
          octal: string;
          hex: string;
        }>("radix_convert", { value: input, from: Number(mode) });
        return [
          `十进制: ${r.decimal}`,
          `二进制: ${r.binary}`,
          `八进制: ${r.octal}`,
          `十六进制: ${r.hex}`,
        ].join("\n");
      }}
    />
  );
}

function JsonYamlTab() {
  return (
    <ConvertPanel
      sample={'{"service":"dev-helper","ports":[1420],"debug":true}'}
      placeholder="粘贴 JSON 或 YAML"
      modes={[
        { value: "j2y", label: "JSON → YAML" },
        { value: "y2j", label: "YAML → JSON" },
      ]}
      hint="YAML 采用标准块风格；重新序列化会丢注释与锚点。"
      rows={8}
      run={(text, mode) =>
        mode === "j2y"
          ? call<string>("json_to_yaml", { text })
          : call<string>("yaml_to_json", { text })
      }
    />
  );
}

function JsonXmlTab() {
  const [indent, setIndent] = useState<"2" | "4">("2");
  return (
    <ConvertPanel
      sample={'{"user":{"@id":"7","name":"Ada","tags":["dev","ts"]}}'}
      placeholder="粘贴 JSON 或 XML"
      modes={[
        { value: "j2x", label: "JSON → XML" },
        { value: "x2j", label: "XML → JSON" },
      ]}
      hint="JSON 顶层单键作为根节点；@key 输出属性、#text 输出文本。XML 文本统一保持字符串。"
      rows={8}
      options={(mode) =>
        mode === "j2x" ? (
          <label className="option">
            缩进
            <Segmented
              value={indent}
              options={[
                { value: "2", label: "2 空格" },
                { value: "4", label: "4 空格" },
              ]}
              onChange={setIndent}
            />
          </label>
        ) : null
      }
      run={(text, mode) =>
        mode === "j2x"
          ? call<string>("json_to_xml", { text, indent: Number(indent) })
          : call<string>("xml_to_json", { text })
      }
    />
  );
}

function KvTab() {
  return (
    <ConvertPanel
      sample={"id=1001\nname=Ada\nactive=true\nnote=null\nprofile={lang=ts, level=3}"}
      placeholder="支持 key=value、key: value，换行或逗号分隔，也支持嵌套 { }"
      hint="值会自动识别数字 / 布尔 / null；超过 2^53 的整数按字符串输出，避免丢精度。"
      rows={8}
      runLabel="转 JSON"
      run={async (input) => {
        const r = await call<{ tree: string; json: string }>("kv_to_json", { input });
        return `缩进视图\n${r.tree}\nJSON\n${r.json}`;
      }}
    />
  );
}

function UnicodeTab() {
  return (
    <ConvertPanel
      sample="你好，dev-helper 😀"
      placeholder="粘贴文本或含 \\uXXXX 的转义串"
      modes={[
        { value: "escape", label: "转义" },
        { value: "unescape", label: "还原" },
      ]}
      hint="非 ASCII 字符转成 \\uXXXX；补充平面字符会拆成代理项对，可原样还原。"
      run={(text, mode) =>
        mode === "escape"
          ? call<string>("unicode_escape", { text })
          : call<string>("unicode_unescape", { text })
      }
    />
  );
}

function RmbTab() {
  return (
    <ConvertPanel
      sample="10001.05"
      placeholder="数字金额（如 10001.05）或中文大写金额（如 壹万零壹元零伍分）"
      modes={[
        { value: "up", label: "数字 → 大写" },
        { value: "down", label: "大写 → 数字" },
      ]}
      hint="最多两位小数、上限 9999 亿；正确处理零、角分、整与万 / 亿单位。"
      rows={4}
      run={(text, mode) =>
        mode === "up"
          ? call<string>("rmb_to_upper", { amount: text })
          : call<string>("rmb_from_upper", { text })
      }
    />
  );
}

export default function Converter() {
  const [active, setActive] = useState<TabId>("base64");
  const { items, record } = useTabUsage("converter", TABS);

  function select(id: TabId) {
    setActive(id);
    record(id);
  }

  return (
    <>
      <Tabs value={active} items={items} onChange={select} />
      <div hidden={active !== "base64"}>
        <Base64Tab />
      </div>
      <div hidden={active !== "url"}>
        <UrlTab />
      </div>
      <div hidden={active !== "radix"}>
        <RadixTab />
      </div>
      <div hidden={active !== "jy"}>
        <JsonYamlTab />
      </div>
      <div hidden={active !== "jx"}>
        <JsonXmlTab />
      </div>
      <div hidden={active !== "kv"}>
        <KvTab />
      </div>
      <div hidden={active !== "unicode"}>
        <UnicodeTab />
      </div>
      <div hidden={active !== "rmb"}>
        <RmbTab />
      </div>
    </>
  );
}
