//! # 键值文本转换
//!
//! 把 Debezium / 日志里那种裸键值文本（`{op=r, after={ID=2855, NAME=张三}}`）
//! 解析成两样东西：一棵缩进树，和一份合法 JSON。
//!
//! 这类文本不是 JSON：键不带引号、字符串不带引号、数字还可能是 18 位身份证号。
//! 所以不能靠替换引号糊过去，必须真的按括号层级解析。

use serde::Serialize;

/// 解析后的值
enum Value {
    Null,
    Bool(bool),
    /// 保留原始数字文本：18 位 ID 转 f64 会丢精度
    Num(String),
    Str(String),
    Obj(Vec<(String, Value)>),
}

#[derive(Serialize)]
pub struct KvResult {
    /// 缩进树，`key = value` 形式
    pub tree: String,
    /// 美化后的 JSON
    pub json: String,
}

struct Parser {
    c: Vec<char>,
    i: usize,
}

impl Parser {
    fn new(s: &str) -> Self {
        Self { c: s.chars().collect(), i: 0 }
    }

    fn peek(&self) -> Option<char> {
        self.c.get(self.i).copied()
    }

    fn bump(&mut self) -> Option<char> {
        let ch = self.peek();
        if ch.is_some() {
            self.i += 1;
        }
        ch
    }

    fn skip_ws(&mut self) {
        while matches!(self.peek(), Some(c) if c.is_whitespace()) {
            self.i += 1;
        }
    }

    fn eat(&mut self, ch: char) -> bool {
        if self.peek() == Some(ch) {
            self.i += 1;
            true
        } else {
            false
        }
    }

    fn parse_value(&mut self) -> Result<Value, String> {
        self.skip_ws();
        match self.peek() {
            Some('{') => self.parse_obj(),
            Some(q @ ('"' | '\'')) => {
                self.i += 1;
                let mut s = String::new();
                loop {
                    match self.bump() {
                        Some(c) if c == q => break,
                        Some('\\') => {
                            if let Some(n) = self.bump() {
                                s.push(match n {
                                    'n' => '\n',
                                    't' => '\t',
                                    'r' => '\r',
                                    other => other,
                                });
                            }
                        }
                        Some(c) => s.push(c),
                        None => return Err("字符串缺少结束引号".into()),
                    }
                }
                Ok(Value::Str(s))
            }
            Some(_) => {
                let w = self.read_bare();
                Ok(classify(&w))
            }
            None => Ok(Value::Null),
        }
    }

    /// 读到这一层级的 , 或 } 为止。注意：裸值里不能再出现逗号，
    /// Debezium 打印字符串时不加引号，含逗号的字符串只能靠引号括起来。
    fn read_bare(&mut self) -> String {
        let mut s = String::new();
        while let Some(c) = self.peek() {
            if c == ',' || c == '}' {
                break;
            }
            s.push(c);
            self.i += 1;
        }
        s.trim().to_string()
    }

    fn parse_obj(&mut self) -> Result<Value, String> {
        self.eat('{');
        let mut fields: Vec<(String, Value)> = Vec::new();
        loop {
            self.skip_ws();
            if self.eat('}') {
                break;
            }
            if self.peek().is_none() {
                return Err("缺少右花括号 }".into());
            }

            // 键：读到 = 为止（兼容 key: value 写法）
            let mut key = String::new();
            while let Some(c) = self.peek() {
                if c == '=' || c == ':' || c == ',' || c == '}' {
                    break;
                }
                key.push(c);
                self.i += 1;
            }
            let key = key.trim().trim_matches('"').trim_matches('\'').to_string();

            if !self.eat('=') {
                self.eat(':');
            }

            let v = self.parse_value()?;
            if !key.is_empty() {
                fields.push((key, v));
            }

            self.skip_ws();
            self.eat(',');
        }
        Ok(Value::Obj(fields))
    }
}

/// 裸值分类：null / 布尔 / 数字 / 字符串
fn classify(w: &str) -> Value {
    if w.is_empty() {
        return Value::Str(String::new());
    }
    match w {
        "null" | "NULL" | "Null" => return Value::Null,
        "true" | "TRUE" => return Value::Bool(true),
        "false" | "FALSE" => return Value::Bool(false),
        _ => {}
    }

    let body = w.strip_prefix('-').unwrap_or(w);
    let all_digits = !body.is_empty() && body.bytes().all(|b| b.is_ascii_digit());
    if all_digits {
        // 前导 0 当作字符串：007 不是合法 JSON 数字
        if body.len() > 1 && body.starts_with('0') {
            return Value::Str(w.to_string());
        }
        return Value::Num(w.to_string());
    }
    // 3.14、-0.5 这类小数
    if w.contains('.') && w.parse::<f64>().is_ok() {
        return Value::Num(w.to_string());
    }
    Value::Str(w.to_string())
}

fn escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

/// JSON 对数字没有精度上限，但 JS 侧只有 2^53，超出的一律按字符串给，
/// 免得下游 JSON.parse 之后把身份证号、雪花 ID 悄悄改成另一个数。
fn num_literal(raw: &str) -> String {
    const SAFE: i128 = 9_007_199_254_740_991;
    match raw.parse::<i128>() {
        Ok(n) if n.abs() <= SAFE => raw.to_string(),
        Ok(_) => format!("\"{}\"", escape(raw)),
        // 小数本身就是 IEEE 754，原样输出即可
        Err(_) if raw.parse::<f64>().is_ok() => raw.to_string(),
        Err(_) => format!("\"{}\"", escape(raw)),
    }
}

fn write_json(v: &Value, indent: usize, out: &mut String) {
    let pad = "  ".repeat(indent);
    match v {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Num(n) => out.push_str(&num_literal(n)),
        Value::Str(s) => {
            out.push('"');
            out.push_str(&escape(s));
            out.push('"');
        }
        Value::Obj(fields) => {
            if fields.is_empty() {
                out.push_str("{}");
                return;
            }
            out.push_str("{\n");
            for (idx, (k, val)) in fields.iter().enumerate() {
                out.push_str(&"  ".repeat(indent + 1));
                out.push('"');
                out.push_str(&escape(k));
                out.push_str("\": ");
                write_json(val, indent + 1, out);
                if idx + 1 < fields.len() {
                    out.push(',');
                }
                out.push('\n');
            }
            out.push_str(&pad);
            out.push('}');
        }
    }
}

fn write_tree(v: &Value, indent: usize, out: &mut String) {
    let pad = "  ".repeat(indent);
    match v {
        Value::Obj(fields) => {
            for (k, val) in fields {
                out.push_str(&pad);
                out.push_str(k);
                match val {
                    Value::Obj(sub) if !sub.is_empty() => {
                        out.push_str(" = {\n");
                        write_tree(val, indent + 1, out);
                        out.push_str(&pad);
                        out.push_str("}\n");
                    }
                    Value::Obj(_) => out.push_str(" = {}\n"),
                    other => {
                        out.push_str(" = ");
                        out.push_str(&scalar_text(other));
                        out.push('\n');
                    }
                }
            }
        }
        // 顶层不是对象：直接平铺一行
        other => {
            out.push_str(&pad);
            out.push_str(&scalar_text(other));
            out.push('\n');
        }
    }
}

fn scalar_text(v: &Value) -> String {
    match v {
        Value::Null => "null".into(),
        Value::Bool(b) => b.to_string(),
        Value::Num(n) => n.clone(),
        Value::Str(s) => s.clone(),
        Value::Obj(_) => "{}".into(),
    }
}

/// # 键值文本转 JSON
///
/// ## 参数
/// - `input`：裸键值文本，可带外层花括号，也接受 `a=1, b=2` 这样不带括号的片段
///
/// ## 返回
/// - `tree`：缩进树，键值用 `=` 连接，一层两空格
/// - `json`：两空格缩进的合法 JSON
///
/// ## 错误
/// 括号不配对、字符串引号未闭合时返回带位置的说明。
#[tauri::command]
pub fn kv_to_json(input: String) -> Result<KvResult, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("没有内容可解析".into());
    }

    // 不带外层花括号的片段，补一层再解析
    let src = if trimmed.starts_with('{') {
        trimmed.to_string()
    } else {
        format!("{{{trimmed}}}")
    };

    let mut p = Parser::new(&src);
    let v = p.parse_value().map_err(|e| format!("{e}（第 {} 个字符附近）", p.i))?;

    p.skip_ws();
    if p.peek().is_some() {
        return Err(format!("第 {} 个字符之后还有多余内容，括号可能没配对", p.i));
    }

    let mut tree = String::new();
    write_tree(&v, 0, &mut tree);

    let mut json = String::new();
    write_json(&v, 0, &mut json);

    Ok(KvResult { tree, json })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{op=r, before=null, ts_us=1793591560781557, after={ORG_ID=null, IS_DELETED=0, REALM_ID=LOGISTICS-DRIVER, ID=2855, NAME=周礼明, ID_CARD=450122196110283019, USER_TYPE_DIC=1}, source={connector=mysql, db=adm, table=ADM_USER, version=3.0.1.Final, snapshot=true}, transaction=null, ts_ms=1793591560781}"#;

    #[test]
    fn nested_objects_are_parsed() {
        let r = kv_to_json(SAMPLE.into()).unwrap();
        assert!(r.json.contains("\"after\": {"));
        assert!(r.json.contains("\"source\": {"));
        assert!(r.json.contains("\"op\": \"r\""));
    }

    #[test]
    fn chinese_value_survives() {
        let r = kv_to_json(SAMPLE.into()).unwrap();
        assert!(r.json.contains("\"NAME\": \"周礼明\""));
        assert!(r.tree.contains("NAME = 周礼明"));
    }

    #[test]
    fn dot_version_stays_string() {
        let r = kv_to_json("{version=3.0.1.Final}".into()).unwrap();
        assert!(r.json.contains("\"version\": \"3.0.1.Final\""));
    }

    #[test]
    fn oversized_integer_becomes_string() {
        // 身份证号 18 位，超过 2^53，转成 JSON 数字会被 JS 改值
        let r = kv_to_json("{ID_CARD=450122196110283019}".into()).unwrap();
        assert!(r.json.contains("\"ID_CARD\": \"450122196110283019\""));
    }

    #[test]
    fn safe_integer_stays_number() {
        let r = kv_to_json("{ID=2855}".into()).unwrap();
        assert!(r.json.contains("\"ID\": 2855"));
    }

    #[test]
    fn floating_point_stays_number() {
        let r = kv_to_json("{ratio=0.5}".into()).unwrap();
        assert!(r.json.contains("\"ratio\": 0.5"));
    }

    #[test]
    fn leading_zero_is_string() {
        let r = kv_to_json("{code=007}".into()).unwrap();
        assert!(r.json.contains("\"code\": \"007\""));
    }

    #[test]
    fn without_outer_braces_works() {
        let r = kv_to_json("a=1, b=2".into()).unwrap();
        assert!(r.json.contains("\"a\": 1"));
        assert!(r.json.contains("\"b\": 2"));
    }

    #[test]
    fn json_output_is_valid_json() {
        let r = kv_to_json(SAMPLE.into()).unwrap();
        let v: serde_json::Value = serde_json::from_str(&r.json).unwrap();
        assert_eq!(v["after"]["ID"], 2855);
        assert_eq!(v["after"]["NAME"], "周礼明");
        assert_eq!(v["source"]["snapshot"], true);
        assert!(v["before"].is_null());
    }

    #[test]
    fn tree_is_indented() {
        let r = kv_to_json("{a=1, b={c=2}}".into()).unwrap();
        assert_eq!(r.tree, "a = 1\nb = {\n  c = 2\n}\n");
    }

    #[test]
    fn unclosed_brace_is_reported() {
        assert!(kv_to_json("{a=1".into()).is_err());
    }

    #[test]
    fn empty_input_is_rejected() {
        assert!(kv_to_json("   ".into()).is_err());
    }
}
