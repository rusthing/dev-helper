use serde_json::Value;

const IND2: &[u8] = b"  ";
const IND4: &[u8] = b"    ";

fn sort_value(v: Value) -> Value {
    match v {
        Value::Object(map) => {
            let mut entries: Vec<(String, Value)> = map.into_iter().collect();
            entries.sort_by(|a, b| a.0.cmp(&b.0));
            Value::Object(
                entries
                    .into_iter()
                    .map(|(k, v)| (k, sort_value(v)))
                    .collect(),
            )
        }
        Value::Array(arr) => Value::Array(arr.into_iter().map(sort_value).collect()),
        other => other,
    }
}

/// 递归展开内嵌的 JSON 字符串：如果一个字符串本身是一个合法的 JSON
/// 对象或数组，就再解析一层、替换成真正的嵌套结构。标量（数字 / 布尔 /
/// null / 字符串）不展开，避免把 "123" "true" "null" 这种也误判成 JSON。
fn expand_value(v: Value) -> Value {
    match v {
        Value::Object(map) => Value::Object(
            map.into_iter()
                .map(|(k, val)| (k, expand_value(val)))
                .collect(),
        ),
        Value::Array(arr) => Value::Array(arr.into_iter().map(expand_value).collect()),
        Value::String(s) => {
            if let Ok(inner) = serde_json::from_str::<Value>(&s) {
                match inner {
                    Value::Object(_) | Value::Array(_) => return expand_value(inner),
                    _ => {}
                }
            }
            Value::String(s)
        }
        other => other,
    }
}

#[tauri::command]
pub fn json_format(
    text: String,
    indent: usize,
    sort_keys: bool,
    minify: bool,
    expand_strings: bool,
) -> Result<String, String> {
    if text.trim().is_empty() {
        return Ok(String::new());
    }
    let v: Value = serde_json::from_str(&text).map_err(|e| format!("JSON 语法错误：{e}"))?;
    // 先展开内嵌 JSON，再排序（排序对展开出来的嵌套结构同样递归生效）
    let v = if expand_strings { expand_value(v) } else { v };
    let v = if sort_keys { sort_value(v) } else { v };

    if minify {
        return serde_json::to_string(&v).map_err(|e| e.to_string());
    }

    let ind: &[u8] = if indent >= 4 { IND4 } else { IND2 };
    let formatter = serde_json::ser::PrettyFormatter::with_indent(ind);
    let mut buf = Vec::new();
    let mut ser = serde_json::Serializer::with_formatter(&mut buf, formatter);
    serde::Serialize::serialize(&v, &mut ser).map_err(|e| e.to_string())?;
    String::from_utf8(buf).map_err(|e| e.to_string())
}

/// 把 JSON 压成单行并统计体积，用于「压缩后省了多少」的提示
#[tauri::command]
pub fn json_size(text: String) -> usize {
    text.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pretty_and_minify() {
        let pretty = json_format(r#"{"b":1,"a":[1,2]}"#.into(), 2, false, false, false).unwrap();
        assert!(pretty.contains("\n"));
        let mini = json_format(r#"{"b":1,"a":[1,2]}"#.into(), 2, false, true, false).unwrap();
        assert_eq!(mini, r#"{"b":1,"a":[1,2]}"#);
    }

    #[test]
    fn sorts_keys() {
        let out = json_format(r#"{"b":1,"a":2}"#.into(), 2, true, true, false).unwrap();
        assert_eq!(out, r#"{"a":2,"b":1}"#);
    }

    #[test]
    fn reports_syntax_error() {
        assert!(json_format("{oops".into(), 2, false, false, false).is_err());
    }

    #[test]
    fn expands_nested_json_string() {
        // ext 是内嵌 JSON 字符串，keep 是普通字符串（恰好是数字）
        let out = json_format(
            r#"{"ext":"{\"a\":1}","keep":"123"}"#.into(),
            2,
            false,
            false,
            true,
        )
        .unwrap();
        assert!(out.contains("\"ext\": {"), "ext 应展开成对象");
        assert!(out.contains("\"keep\": \"123\""), "纯数字字符串不应被展开");
    }

    #[test]
    fn no_expand_by_default() {
        let out = json_format(
            r#"{"ext":"{\"a\":1}"}"#.into(),
            2,
            false,
            false,
            false,
        )
        .unwrap();
        assert!(out.contains("\"ext\": \"{\\\"a\\\":1}\""), "默认不展开，ext 仍是转义字符串");
    }

    #[test]
    fn expand_preserves_big_int() {
        // 雪花 ID 超过 2^53，serde_json 按 i64 精确解析，不能像 JS number 那样舍入
        let out = json_format(
            r#"{"ext":"{\"bindTargetId\":1279767064111218772}"}"#.into(),
            2,
            false,
            false,
            true,
        )
        .unwrap();
        assert!(
            out.contains("\"bindTargetId\": 1279767064111218772"),
            "雪花 ID 不应被舍入，实际输出：{out}"
        );
    }

    #[test]
    fn expand_is_recursive() {
        // ext 里再套一层 JSON 字符串
        let out = json_format(
            r#"{"ext":"{\"inner\":\"{\\\"b\\\":2}\"}"}"#.into(),
            2,
            false,
            false,
            true,
        )
        .unwrap();
        assert!(out.contains("\"inner\": {"), "嵌套的 JSON 字符串也应被展开");
    }
}
