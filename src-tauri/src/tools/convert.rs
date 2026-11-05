use quick_xml::Reader;
use quick_xml::events::Event;
use serde::Serialize;
use serde_json::{Map, Value};

// ---------------------------------------------------------------------------
// 进制转换
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct RadixResult {
    pub decimal: String,
    pub binary: String,
    pub octal: String,
    pub hex: String,
}

fn strip_prefix(s: &str, from: u32) -> &str {
    let lower = s.to_ascii_lowercase();
    match from {
        2 if lower.starts_with("0b") => &s[2..],
        8 if lower.starts_with("0o") => &s[2..],
        16 if lower.starts_with("0x") => &s[2..],
        _ => s,
    }
}

/// # 任意进制转 2 / 8 / 10 / 16
///
/// 支持负数和 `0b` / `0o` / `0x` 前缀（前缀要与来源进制一致）。
/// 数字按 `i128` 解析，超出范围会明确报错。
#[tauri::command]
pub fn radix_convert(value: String, from: u32) -> Result<RadixResult, String> {
    if !matches!(from, 2 | 8 | 10 | 16) {
        return Err("来源进制只能是 2 / 8 / 10 / 16".into());
    }
    let raw = value.trim();
    if raw.is_empty() {
        return Err("请输入要转换的数字".into());
    }

    let (negative, body) = match raw.strip_prefix('-') {
        Some(rest) => (true, strip_prefix(rest, from)),
        None => (false, strip_prefix(raw.trim_start_matches('+'), from)),
    };
    if body.is_empty() {
        return Err("数字缺少有效位".into());
    }
    let invalid = |c: char| !c.is_digit(from);
    if body.chars().any(invalid) {
        return Err(format!("这个输入不是合法的 {from} 进制数字"));
    }

    let n = i128::from_str_radix(body, from)
        .map_err(|_| "数字超出支持范围（最大约 1.7 × 10^38）".to_string())?;
    let n = if negative { -n } else { n };

    let (sign, abs) = if n < 0 { ("-", -n) } else { ("", n) };
    Ok(RadixResult {
        decimal: format!("{n}"),
        binary: format!("{sign}0b{abs:b}"),
        octal: format!("{sign}0o{abs:o}"),
        hex: format!("{sign}0x{abs:x}"),
    })
}

// ---------------------------------------------------------------------------
// JSON <-> YAML
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn json_to_yaml(text: String) -> Result<String, String> {
    if text.trim().is_empty() {
        return Ok(String::new());
    }
    let v: Value = serde_json::from_str(&text).map_err(|e| format!("JSON 语法错误：{e}"))?;
    serde_yaml::to_string(&v).map_err(|e| format!("YAML 生成失败：{e}"))
}

#[tauri::command]
pub fn yaml_to_json(text: String) -> Result<String, String> {
    if text.trim().is_empty() {
        return Ok(String::new());
    }
    let v: Value =
        serde_yaml::from_str(&text).map_err(|e| format!("YAML 语法错误：{e}"))?;
    serde_json::to_string_pretty(&v).map_err(|e| format!("JSON 生成失败：{e}"))
}

// ---------------------------------------------------------------------------
// JSON <-> XML
// ---------------------------------------------------------------------------

fn escape_xml(s: &str, attr: bool) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' if attr => out.push_str("&quot;"),
            '\'' if attr => out.push_str("&apos;"),
            _ => out.push(c),
        }
    }
    out
}

fn is_valid_xml_name(name: &str) -> bool {
    let mut chars = name.chars();
    match chars.next() {
        Some(c) if c.is_alphabetic() || c == '_' || c == ':' => {}
        _ => return false,
    }
    chars.all(|c| c.is_alphanumeric() || matches!(c, '_' | '-' | '.' | ':'))
}

fn xml_tags(name: &str, attrs: &[(String, String)], empty: bool) -> (String, String) {
    let mut open = format!("<{name}");
    for (k, v) in attrs {
        open.push_str(&format!(" {k}=\"{}\"", escape_xml(v, true)));
    }
    if empty {
        open.push_str("/>");
        (open, String::new())
    } else {
        open.push('>');
        (open, format!("</{name}>"))
    }
}

struct XmlWriter<'a> {
    indent: &'a str,
}

impl XmlWriter<'_> {
    fn write_value(&self, name: &str, value: &Value, depth: usize, out: &mut String) -> Result<(), String> {
        if !is_valid_xml_name(name) {
            return Err(format!("键「{name}」不是合法的 XML 标签名"));
        }
        let pad = self.indent.repeat(depth);
        match value {
            Value::Array(items) => {
                if items.is_empty() {
                    out.push_str(&format!("{pad}<{name}/>\n"));
                } else {
                    for item in items {
                        self.write_value(name, item, depth, out)?;
                    }
                }
            }
            Value::Object(map) => {
                let mut attrs = Vec::new();
                let mut children = Vec::new();
                let mut text: Option<String> = None;
                for (k, v) in map {
                    if let Some(attr_name) = k.strip_prefix('@') {
                        if !is_valid_xml_name(attr_name) {
                            return Err(format!("属性名「{attr_name}」不合法"));
                        }
                        attrs.push((attr_name.to_string(), scalar_text(v)));
                    } else if k == "#text" {
                        text = Some(scalar_text(v));
                    } else {
                        children.push((k, v));
                    }
                }
                if children.is_empty() {
                    let content = text.unwrap_or_default();
                    let (open, close) = xml_tags(name, &attrs, content.is_empty());
                    out.push_str(&format!("{pad}{open}"));
                    if !content.is_empty() {
                        out.push_str(&escape_xml(&content, false));
                        out.push_str(&close);
                    }
                    out.push('\n');
                    return Ok(());
                }
                let (open, close) = xml_tags(name, &attrs, false);
                out.push_str(&format!("{pad}{open}\n"));
                if let Some(t) = text {
                    if !t.is_empty() {
                        out.push_str(&format!("{pad}{}{}\n", self.indent, escape_xml(&t, false)));
                    }
                }
                for (k, v) in children {
                    self.write_value(k, v, depth + 1, out)?;
                }
                out.push_str(&format!("{pad}{close}\n"));
            }
            Value::Null => out.push_str(&format!("{pad}<{name}/>\n")),
            other => {
                let content = scalar_text(other);
                let (open, close) = xml_tags(name, &[], false);
                out.push_str(&format!(
                    "{pad}{open}{}{close}\n",
                    escape_xml(&content, false)
                ));
            }
        }
        Ok(())
    }
}

fn scalar_text(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

/// # JSON 转 XML
///
/// 约定：单个顶层键直接作为根节点；顶层不是单键对象时用 `<root>` 包一层。
/// 对象里以 `@` 开头的键输出为属性，`#text` 输出为文本内容；数组会展开成
/// 多个同名节点。
#[tauri::command]
pub fn json_to_xml(text: String, indent: usize) -> Result<String, String> {
    if text.trim().is_empty() {
        return Ok(String::new());
    }
    let v: Value = serde_json::from_str(&text).map_err(|e| format!("JSON 语法错误：{e}"))?;
    let writer = XmlWriter {
        indent: &" ".repeat(indent.clamp(1, 8)),
    };
    let mut out = String::new();
    match &v {
        Value::Object(map) if map.len() == 1 => {
            let (k, val) = map.iter().next().expect("已判断长度为 1");
            writer.write_value(k, val, 0, &mut out)?;
        }
        Value::Array(items) => {
            for item in items {
                writer.write_value("item", item, 0, &mut out)?;
            }
        }
        other => writer.write_value("root", other, 0, &mut out)?,
    }
    Ok(out.trim_end().to_string())
}

#[derive(Default)]
struct XmlNode {
    name: String,
    attrs: Vec<(String, String)>,
    children: Vec<XmlNode>,
    text: String,
}

impl XmlNode {
    fn to_json(&self) -> Value {
        if self.attrs.is_empty() && self.children.is_empty() {
            return Value::String(self.text.trim().to_string());
        }
        let mut map = Map::new();
        for (k, v) in &self.attrs {
            map.insert(format!("@{k}"), Value::String(v.clone()));
        }
        let text = self.text.trim();
        if !text.is_empty() {
            map.insert("#text".to_string(), Value::String(text.to_string()));
        }
        for child in &self.children {
            let v = child.to_json();
            match map.get_mut(&child.name) {
                Some(Value::Array(arr)) => arr.push(v),
                Some(existing) => {
                    let first = existing.clone();
                    map.insert(child.name.clone(), Value::Array(vec![first, v]));
                }
                None => {
                    map.insert(child.name.clone(), v);
                }
            }
        }
        Value::Object(map)
    }
}

fn read_text(bytes: &[u8], unescape: bool) -> String {
    let raw = String::from_utf8_lossy(bytes).to_string();
    if !unescape {
        return raw;
    }
    quick_xml::escape::unescape(&raw)
        .map(|s| s.to_string())
        .unwrap_or(raw)
}

/// # XML 转 JSON
///
/// 属性输出为 `@name`，重复子节点合并成数组，混合内容里的文本放进 `#text`。
/// 文本保持字符串类型，不做数字 / 布尔推断，避免订单号之类丢前导零。
#[tauri::command]
pub fn xml_to_json(text: String) -> Result<String, String> {
    if text.trim().is_empty() {
        return Ok(String::new());
    }
    let mut reader = Reader::from_str(&text);
    reader.config_mut().trim_text(false);
    let mut stack: Vec<XmlNode> = Vec::new();
    let mut roots: Vec<XmlNode> = Vec::new();

    loop {
        match reader.read_event() {
            Err(e) => return Err(format!("XML 解析失败：{e}")),
            Ok(Event::Eof) => break,
            Ok(Event::Start(e)) => {
                let mut node = XmlNode {
                    name: String::from_utf8_lossy(e.name().as_ref()).to_string(),
                    ..Default::default()
                };
                for attr in e.attributes() {
                    let attr = attr.map_err(|e| format!("XML 属性解析失败：{e}"))?;
                    node.attrs.push((
                        String::from_utf8_lossy(attr.key.as_ref()).to_string(),
                        read_text(attr.value.as_ref(), true),
                    ));
                }
                stack.push(node);
            }
            Ok(Event::Empty(e)) => {
                let mut node = XmlNode {
                    name: String::from_utf8_lossy(e.name().as_ref()).to_string(),
                    ..Default::default()
                };
                for attr in e.attributes() {
                    let attr = attr.map_err(|e| format!("XML 属性解析失败：{e}"))?;
                    node.attrs.push((
                        String::from_utf8_lossy(attr.key.as_ref()).to_string(),
                        read_text(attr.value.as_ref(), true),
                    ));
                }
                match stack.last_mut() {
                    Some(parent) => parent.children.push(node),
                    None => roots.push(node),
                }
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                let node = stack
                    .pop()
                    .ok_or_else(|| format!("多余的结束标签 </{name}>"))?;
                if node.name != name {
                    return Err(format!("标签不匹配：<{}> 与 </{name}>", node.name));
                }
                match stack.last_mut() {
                    Some(parent) => parent.children.push(node),
                    None => roots.push(node),
                }
            }
            Ok(Event::Text(e)) => {
                if let Some(parent) = stack.last_mut() {
                    parent.text.push_str(&read_text(e.as_ref(), true));
                }
            }
            Ok(Event::CData(e)) => {
                if let Some(parent) = stack.last_mut() {
                    parent.text.push_str(&read_text(e.as_ref(), false));
                }
            }
            Ok(Event::Decl(_)) | Ok(Event::Comment(_)) | Ok(Event::PI(_)) | Ok(Event::DocType(_)) => {}
        }
    }

    if stack.len() > 1 {
        return Err("XML 标签没有正确闭合".into());
    }
    if roots.is_empty() {
        return Err("XML 里没有找到根节点".into());
    }
    if roots.len() > 1 {
        return Err("XML 只能有一个根节点".into());
    }
    let v = roots[0].to_json();
    serde_json::to_string_pretty(&v).map_err(|e| format!("JSON 生成失败：{e}"))
}

// ---------------------------------------------------------------------------
// Unicode 转义
// ---------------------------------------------------------------------------

/// # Unicode 转义
///
/// 只处理非 ASCII 字符：BMP 内输出 `\uXXXX`，补充平面字符拆成一对代理项，
/// 保证结果可以直接嵌进 JSON / JS 字符串。
#[tauri::command]
pub fn unicode_escape(text: String) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        let cp = c as u32;
        if cp <= 0x7f {
            out.push(c);
        } else if cp <= 0xffff {
            out.push_str(&format!("\\u{cp:04X}"));
        } else {
            let v = cp - 0x10000;
            let hi = 0xd800 + (v >> 10);
            let lo = 0xdc00 + (v & 0x3ff);
            out.push_str(&format!("\\u{hi:04X}\\u{lo:04X}"));
        }
    }
    out
}

fn hex4(s: &str) -> Option<u32> {
    if s.len() < 4 {
        return None;
    }
    u32::from_str_radix(&s[..4], 16).ok()
}

/// # Unicode 还原
///
/// 支持 `\uXXXX`、`\u{XXXX}`、代理项对，以及 `\n` `\t` `\r` `\\` 等常见转义。
/// 不认识的转义原样保留，避免把正则里的 `\d` 吃掉。
#[tauri::command]
pub fn unicode_unescape(text: String) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut i = 0;
    while i < chars.len() {
        if chars[i] != '\\' || i + 1 >= chars.len() {
            out.push(chars[i]);
            i += 1;
            continue;
        }
        let next = chars[i + 1];
        match next {
            'n' => {
                out.push('\n');
                i += 2;
            }
            't' => {
                out.push('\t');
                i += 2;
            }
            'r' => {
                out.push('\r');
                i += 2;
            }
            '\\' => {
                out.push('\\');
                i += 2;
            }
            'u' => {
                // \u{XXXX}
                if chars.get(i + 2) == Some(&'{') {
                    let mut j = i + 3;
                    let mut hex = String::new();
                    while j < chars.len() && chars[j] != '}' {
                        hex.push(chars[j]);
                        j += 1;
                    }
                    if j < chars.len() && !hex.is_empty() {
                        if let Ok(cp) = u32::from_str_radix(&hex, 16) {
                            if let Some(c) = char::from_u32(cp) {
                                out.push(c);
                                i = j + 1;
                                continue;
                        }
                        }
                    }
                } else {
                    let hex: String = chars[i + 2..usize::min(i + 6, chars.len())].iter().collect();
                    if let Some(cp) = hex4(&hex) {
                        if (0xd800..=0xdbff).contains(&cp) {
                            // 高位代理项，尝试和后一个 \uXXXX 组合
                            let low_start = i + 6;
                            if chars.len() > low_start + 5
                                && chars[low_start] == '\\'
                                && chars[low_start + 1] == 'u'
                            {
                                let low_hex: String =
                                    chars[low_start + 2..low_start + 6].iter().collect();
                                if let Some(low) = hex4(&low_hex) {
                                    if (0xdc00..=0xdfff).contains(&low) {
                                        let cp = 0x10000 + ((cp - 0xd800) << 10) + (low - 0xdc00);
                                        if let Some(c) = char::from_u32(cp) {
                                            out.push(c);
                                            i = low_start + 6;
                                            continue;
                                        }
                                    }
                                }
                            }
                        } else if let Some(c) = char::from_u32(cp) {
                            out.push(c);
                            i += 6;
                            continue;
                        }
                    }
                }
                out.push('\\');
                i += 1;
            }
            _ => {
                out.push('\\');
                i += 1;
            }
        }
    }
    out
}

// ---------------------------------------------------------------------------
// 人民币大小写金额
// ---------------------------------------------------------------------------

const RMB_DIGITS: [&str; 10] = ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"];
const RMB_UNITS: [&str; 4] = ["", "拾", "佰", "仟"];
const RMB_GROUPS: [&str; 3] = ["", "万", "亿"];

fn group_to_upper(n: u32) -> String {
    let mut out = String::new();
    let mut zero = false;
    for pos in (0..4).rev() {
        let d = (n / 10u32.pow(pos)) % 10;
        if d == 0 {
            if !out.is_empty() {
                zero = true;
            }
        } else {
            if zero {
                out.push('零');
                zero = false;
            }
            out.push_str(RMB_DIGITS[d as usize]);
            out.push_str(RMB_UNITS[pos as usize]);
        }
    }
    out
}

fn integer_to_upper(n: u64) -> String {
    if n == 0 {
        return "零".into();
    }
    let groups = [
        (n % 10_000) as u32,
        ((n / 10_000) % 10_000) as u32,
        ((n / 100_000_000) % 10_000) as u32,
    ];
    let mut out = String::new();
    let mut pending_zero = false;
    for idx in (0..3).rev() {
        let g = groups[idx];
        if g == 0 {
            if !out.is_empty() {
                pending_zero = true;
            }
            continue;
        }
        if !out.is_empty() && (pending_zero || g < 1000) && !out.ends_with('零') {
            out.push('零');
        }
        out.push_str(&group_to_upper(g));
        out.push_str(RMB_GROUPS[idx]);
        pending_zero = false;
    }
    out
}

fn format_rmb_upper(major: u64, jiao: u8, fen: u8) -> String {
    let mut out = format!("{}元", integer_to_upper(major));
    if jiao == 0 && fen == 0 {
        out.push('整');
    } else if jiao == 0 {
        out.push('零');
        out.push_str(RMB_DIGITS[fen as usize]);
        out.push('分');
    } else {
        out.push_str(RMB_DIGITS[jiao as usize]);
        out.push('角');
        if fen == 0 {
            out.push('整');
        } else {
            out.push_str(RMB_DIGITS[fen as usize]);
            out.push('分');
        }
    }
    out
}

/// 解析金额文本：允许 `¥` / `￥`、千分位逗号与空格，最多两位小数。
fn parse_amount(text: &str) -> Result<(u64, u8, u8), String> {
    let t: String = text
        .trim()
        .trim_start_matches(['¥', '￥'])
        .chars()
        .filter(|c| !matches!(c, ',' | '，' | ' ' | '\t' | '\n' | '\r'))
        .collect();
    if t.is_empty() {
        return Err("请输入金额".into());
    }
    if t.starts_with('-') {
        return Err("金额不能为负数".into());
    }
    let mut parts = t.split('.');
    let int_raw = parts.next().unwrap_or("");
    let frac_raw = parts.next().unwrap_or("");
    if parts.next().is_some() {
        return Err("小数点只能出现一次".into());
    }
    if int_raw.is_empty() && frac_raw.is_empty() {
        return Err("请输入金额数字".into());
    }
    if !int_raw.chars().all(|c| c.is_ascii_digit()) {
        return Err("整数部分只能是数字".into());
    }
    if !frac_raw.chars().all(|c| c.is_ascii_digit()) {
        return Err("小数部分只能是数字".into());
    }
    if frac_raw.len() > 2 {
        return Err("金额最多保留两位小数（角、分）".into());
    }
    let int_trim = int_raw.trim_start_matches('0');
    if int_trim.len() > 12 {
        return Err("金额超出支持范围（最大 9999 亿）".into());
    }
    let major: u64 = if int_trim.is_empty() {
        0
    } else {
        int_trim.parse().map_err(|_| "整数部分太大".to_string())?
    };
    let (jiao, fen) = match frac_raw.len() {
        0 => (0, 0),
        1 => (frac_raw.as_bytes()[0] - b'0', 0),
        _ => (
            frac_raw.as_bytes()[0] - b'0',
            frac_raw.as_bytes()[1] - b'0',
        ),
    };
    Ok((major, jiao, fen))
}

/// # 数字金额转人民币大写
///
/// 例：`10001.05` → `壹万零壹元零伍分`；`10.50` → `壹拾元伍角整`。
#[tauri::command]
pub fn rmb_to_upper(amount: String) -> Result<String, String> {
    let (major, jiao, fen) = parse_amount(&amount)?;
    Ok(format_rmb_upper(major, jiao, fen))
}

fn chinese_digit(c: char) -> Option<u64> {
    const SIMPLE: [char; 10] = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    if let Some(i) = RMB_DIGITS.iter().position(|d| d.chars().next() == Some(c)) {
        return Some(i as u64);
    }
    SIMPLE
        .iter()
        .position(|d| *d == c)
        .map(|i| i as u64)
}

fn parse_section(s: &str) -> Result<u64, String> {
    let mut total = 0u64;
    let mut current = 0u64;
    let mut has_digit = false;
    let mut last_unit = 10_000u64;
    for c in s.chars() {
        if c == '零' {
            current = 0;
            has_digit = false;
            continue;
        }
        if let Some(d) = chinese_digit(c) {
            if has_digit {
                return Err("数位之间缺少单位".into());
            }
            current = d;
            has_digit = true;
            continue;
        }
        let unit = match c {
            '拾' | '十' => 10,
            '佰' | '百' => 100,
            '仟' | '千' => 1_000,
            _ => return Err(format!("无法识别「{c}」")),
        };
        if unit >= last_unit {
            return Err("单位顺序不正确".into());
        }
        let base = if has_digit { current } else { 1 };
        total += base * unit;
        current = 0;
        has_digit = false;
        last_unit = unit;
    }
    Ok(total + current)
}

fn parse_chinese_integer(s: &str) -> Result<u64, String> {
    if s.is_empty() {
        return Ok(0);
    }
    if let Some(pos) = s.find('亿') {
        let left = parse_chinese_integer(&s[..pos])?;
        let right = parse_chinese_integer(&s[pos + '亿'.len_utf8()..])?;
        return left
            .checked_mul(100_000_000)
            .and_then(|v| v.checked_add(right))
            .ok_or_else(|| "金额超出支持范围".to_string());
    }
    if let Some(pos) = s.find('万') {
        let left = parse_chinese_integer(&s[..pos])?;
        let right = parse_chinese_integer(&s[pos + '万'.len_utf8()..])?;
        return left
            .checked_mul(10_000)
            .and_then(|v| v.checked_add(right))
            .ok_or_else(|| "金额超出支持范围".to_string());
    }
    parse_section(s)
}

/// # 人民币大写转数字金额
///
/// 返回形如 `10001.05` 的十进制字符串；`整` / `正` 会被忽略。
#[tauri::command]
pub fn rmb_from_upper(text: String) -> Result<String, String> {
    let cleaned: String = text
        .trim()
        .chars()
        .filter(|c| !matches!(c, ',' | '，' | ' ' | '\t' | '\n' | '\r'))
        .collect();
    if cleaned.is_empty() {
        return Err("请输入中文大写金额".into());
    }
    if cleaned.starts_with('负') {
        return Err("金额不能为负数".into());
    }
    let normalized = cleaned
        .replace('圆', "元")
        .replace('正', "整")
        .trim_end_matches('整')
        .to_string();
    let (int_part, dec_part) = match normalized.split_once('元') {
        Some((i, d)) => (i, d.trim_end_matches('整')),
        None => ("", normalized.as_str()),
    };

    let major = if int_part.is_empty() {
        0
    } else {
        parse_chinese_integer(int_part)?
    };
    if major > 999_999_999_999 {
        return Err("金额超出支持范围（最大 9999 亿）".into());
    }

    let mut jiao = 0u8;
    let mut fen = 0u8;
    let mut current: Option<u8> = None;
    for c in dec_part.chars() {
        if c == '零' {
            current = None;
            continue;
        }
        if let Some(d) = chinese_digit(c) {
            if current.is_some() {
                return Err("角分数字重复".into());
            }
            current = Some(d as u8);
            continue;
        }
        match c {
            '角' => {
                jiao = current.take().unwrap_or(0);
                if jiao > 9 {
                    return Err("角位不合法".into());
                }
            }
            '分' => {
                fen = current.take().unwrap_or(0);
                if fen > 9 {
                    return Err("分位不合法".into());
                }
            }
            _ => return Err(format!("无法识别「{c}」")),
        }
    }
    if current.is_some() {
        return Err("角分缺少单位".into());
    }

    Ok(if jiao == 0 && fen == 0 {
        major.to_string()
    } else {
        format!("{major}.{jiao}{fen}")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn radix_roundtrip() {
        let r = radix_convert("ff".into(), 16).unwrap();
        assert_eq!(r.decimal, "255");
        assert_eq!(r.binary, "0b11111111");
        assert_eq!(r.octal, "0o377");
        let r = radix_convert("-0b1010".into(), 2).unwrap();
        assert_eq!(r.decimal, "-10");
    }

    #[test]
    fn radix_rejects_bad_digit() {
        assert!(radix_convert("102".into(), 2).is_err());
        assert!(radix_convert("xyz".into(), 16).is_err());
    }

    #[test]
    fn yaml_json_roundtrip() {
        let y = json_to_yaml(r#"{"a":1,"b":[true,null],"c":"x"}"#.into()).unwrap();
        assert!(y.contains("a: 1"));
        let j = yaml_to_json(y).unwrap();
        assert!(j.contains("\"a\": 1"));
        assert!(j.contains("\"b\""));
    }

    #[test]
    fn json_xml_roundtrip() {
        let xml = json_to_xml(
            r#"{"user":{"@id":"7","name":"Ada","tags":["a","b"]}}"#.into(),
            2,
        )
        .unwrap();
        assert!(xml.contains("<user id=\"7\">"));
        assert_eq!(xml.matches("<tags>").count(), 2);
        let json = xml_to_json(xml).unwrap();
        assert!(json.contains("\"@id\": \"7\""));
        assert!(json.contains("\"tags\""));
    }

    #[test]
    fn xml_rejects_mismatched_tag() {
        assert!(xml_to_json("<a></b>".into()).is_err());
    }

    #[test]
    fn unicode_roundtrip() {
        let src = "你好 😀";
        let esc = unicode_escape(src.into());
        assert!(esc.contains("\\u4F60"));
        assert!(esc.contains("\\uD83D\\uDE00"));
        assert_eq!(unicode_unescape(esc), src);
    }

    #[test]
    fn rmb_zero_units() {
        assert_eq!(rmb_to_upper("0".into()).unwrap(), "零元整");
        assert_eq!(rmb_to_upper("10001".into()).unwrap(), "壹万零壹元整");
        assert_eq!(rmb_to_upper("100000000".into()).unwrap(), "壹亿元整");
        assert_eq!(
            rmb_to_upper("100010001".into()).unwrap(),
            "壹亿零壹万零壹元整"
        );
        assert_eq!(
            rmb_to_upper("999999999999".into()).unwrap(),
            "玖仟玖佰玖拾玖亿玖仟玖佰玖拾玖万玖仟玖佰玖拾玖元整"
        );
    }

    #[test]
    fn rmb_decimals() {
        assert_eq!(rmb_to_upper("10.50".into()).unwrap(), "壹拾元伍角整");
        assert_eq!(rmb_to_upper("10.05".into()).unwrap(), "壹拾元零伍分");
        assert_eq!(rmb_to_upper("0.05".into()).unwrap(), "零元零伍分");
        assert_eq!(rmb_to_upper("10001.05".into()).unwrap(), "壹万零壹元零伍分");
    }

    #[test]
    fn rmb_validates_input() {
        assert!(rmb_to_upper("12.345".into()).is_err());
        assert!(rmb_to_upper("-1".into()).is_err());
        assert!(rmb_to_upper("abc".into()).is_err());
    }

    #[test]
    fn rmb_reverse() {
        assert_eq!(rmb_from_upper("壹万零壹元整".into()).unwrap(), "10001");
        assert_eq!(rmb_from_upper("壹拾元零伍分".into()).unwrap(), "10.05");
        assert_eq!(rmb_from_upper("壹亿零壹万元整".into()).unwrap(), "100010000");
        assert_eq!(
            rmb_from_upper("玖仟玖佰玖拾玖亿玖仟玖佰玖拾玖万玖仟玖佰玖拾玖元整".into())
                .unwrap(),
            "999999999999"
        );
    }
}
