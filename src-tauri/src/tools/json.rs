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

#[tauri::command]
pub fn json_format(
    text: String,
    indent: usize,
    sort_keys: bool,
    minify: bool,
) -> Result<String, String> {
    if text.trim().is_empty() {
        return Ok(String::new());
    }
    let v: Value = serde_json::from_str(&text).map_err(|e| format!("JSON 语法错误：{e}"))?;
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
        let pretty = json_format(r#"{"b":1,"a":[1,2]}"#.into(), 2, false, false).unwrap();
        assert!(pretty.contains("\n"));
        let mini = json_format(r#"{"b":1,"a":[1,2]}"#.into(), 2, false, true).unwrap();
        assert_eq!(mini, r#"{"b":1,"a":[1,2]}"#);
    }

    #[test]
    fn sorts_keys() {
        let out = json_format(r#"{"b":1,"a":2}"#.into(), 2, true, true).unwrap();
        assert_eq!(out, r#"{"a":2,"b":1}"#);
    }

    #[test]
    fn reports_syntax_error() {
        assert!(json_format("{oops".into(), 2, false, false).is_err());
    }
}
