export type Group = "转换" | "编解码" | "生成" | "文本";

export interface ToolMeta {
  id: string;
  name: string;
  group: Group;
  desc: string;
  /** lucide-react 的图标名 */
  icon: string;
  /**
   * 中文名的拼音首字母（时间戳转换 → sjczz），供搜索用。
   * 名字里的英文（Base64 / URL / JWT / UUID / JSON）不写进来，name 里已经能搜到。
   */
  py: string;
}

export const GROUPS: Group[] = ["转换", "编解码", "生成", "文本"];

/** 分组名也支持拼音首字母，搜 wb 就能把文本组全带出来 */
const GROUP_PY: Record<Group, string> = {
  转换: "zh",
  编解码: "bjm",
  生成: "sc",
  文本: "wb",
};

export const TOOLS: ToolMeta[] = [
  { id: "converter", name: "转换器", group: "转换", desc: "Base64 / URL / 时间戳 / 进制 / JSON↔YAML↔XML / 颜色 / Unicode / 人民币大写", icon: "ArrowLeftRight", py: "zhq" },

  { id: "jwt", name: "JWT 解析", group: "编解码", desc: "解开 header / payload，校验签名", icon: "KeyRound", py: "jx" },

  { id: "hash", name: "哈希计算", group: "生成", desc: "MD5 / SHA-1 / SHA-256 / SHA-512 / SM3 / FNV-1a 与 HMAC", icon: "Hash", py: "xsjs" },
  { id: "password", name: "密码生成", group: "生成", desc: "可配置字符集与长度的随机密码", icon: "Lock", py: "mmsc" },
  { id: "uuid", name: "UUID 生成", group: "生成", desc: "批量生成 v4 / v7，支持格式化", icon: "Fingerprint", py: "sc" },
  { id: "qrcode", name: "二维码", group: "生成", desc: "文本转二维码，可保存为图片", icon: "QrCode", py: "ewm" },
  { id: "cron", name: "Cron 生成器", group: "生成", desc: "可视化拼出 crontab 表达式，中文回显与字段校验", icon: "CalendarClock", py: "cronscq" },

  { id: "formatter", name: "格式化器", group: "文本", desc: "JSON / SQL / JS / XML / HTML / CSS / YAML / Markdown / URL 参数", icon: "Wand2", py: "gshq" },
  { id: "kvjson", name: "键值转 JSON", group: "文本", desc: "Debezium / 日志里的 {k=v} 文本转成缩进树与 JSON", icon: "Brackets", py: "jzz" },
  { id: "regex", name: "正则测试", group: "文本", desc: "实时高亮匹配结果与捕获组", icon: "Regex", py: "zzcs" },
  { id: "diff", name: "文本对比", group: "文本", desc: "逐行 diff，看清增删改", icon: "GitCompare", py: "wbdb" },
  { id: "text", name: "文本处理", group: "文本", desc: "大小写、去重、排序、统计", icon: "Type", py: "wbcl" },
];

/**
 * # 判断工具是否命中搜索词
 *
 * 名称、描述、分组、拼音首字母都能命中，全部不区分大小写。
 * 首字母按子串匹配，所以 `sjczz`、`czz`、`sj` 都能搜到时间戳转换。
 *
 * ## 参数
 * - `t`：工具元数据
 * - `raw`：搜索框里的原始输入，首尾空格会被忽略
 *
 * ## 返回值
 * 命中返回 `true`；输入为空时恒为 `true`（不过滤）
 *
 * ## 示例
 * ```
 * matchTool(时间戳转换, "SJCZZ") // true
 * matchTool(Base64 编解码, "base") // true
 * ```
 */
export function matchTool(t: ToolMeta, raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  return (
    t.name.toLowerCase().includes(q) ||
    t.desc.toLowerCase().includes(q) ||
    t.group.toLowerCase().includes(q) ||
    t.py.includes(q) ||
    GROUP_PY[t.group].includes(q)
  );
}
