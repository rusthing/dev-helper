use percent_encoding::{AsciiSet, CONTROLS, percent_decode_str, utf8_percent_encode};
use serde::Serialize;

/// 保留 `/ : @ & = + $ #` 等 URL 结构字符，只编码会破坏语义的字符
const FRAGMENT: &AsciiSet = &CONTROLS
    .add(b' ')
    .add(b'"')
    .add(b'<')
    .add(b'>')
    .add(b'`')
    .add(b'%')
    .add(b'{')
    .add(b'}')
    .add(b'|')
    .add(b'\\')
    .add(b'^');

#[tauri::command]
pub fn url_encode(text: String) -> String {
    utf8_percent_encode(&text, FRAGMENT).to_string()
}

#[tauri::command]
pub fn url_decode(text: String) -> String {
    percent_decode_str(&text).decode_utf8_lossy().to_string()
}

#[derive(Serialize)]
pub struct UrlParts {
    pub scheme: String,
    pub host: String,
    pub port: String,
    pub path: String,
    pub fragment: String,
    pub query: Vec<(String, String)>,
    pub error: Option<String>,
}

#[tauri::command]
pub fn url_parse(text: String) -> UrlParts {
    let s = text.trim();
    if s.is_empty() {
        return UrlParts::empty(Some("请输入 URL".into()));
    }

    let mut rest = s;
    let mut scheme = String::new();
    if let Some(pos) = rest.find("://") {
        scheme = rest[..pos].to_string();
        rest = &rest[pos + 3..];
    }

    let mut fragment = String::new();
    if let Some(pos) = rest.find('#') {
        fragment = rest[pos + 1..].to_string();
        rest = &rest[..pos];
    }

    let mut query_raw = String::new();
    if let Some(pos) = rest.find('?') {
        query_raw = rest[pos + 1..].to_string();
        rest = &rest[..pos];
    }

    let mut path = String::new();
    if let Some(pos) = rest.find('/') {
        path = rest[pos..].to_string();
        rest = &rest[..pos];
    }

    let mut host = rest.to_string();
    let mut port = String::new();
    // 端口：最后一个冒号之后全是数字
    if let Some(pos) = rest.rfind(':') {
        let maybe = &rest[pos + 1..];
        if !maybe.is_empty() && maybe.bytes().all(|b| b.is_ascii_digit()) {
            port = maybe.to_string();
            host = rest[..pos].to_string();
        }
    }

    let query = query_raw
        .split('&')
        .filter(|p| !p.is_empty())
        .map(|pair| {
            let mut it = pair.splitn(2, '=');
            let k = it.next().unwrap_or("");
            let v = it.next().unwrap_or("");
            (
                percent_decode_str(k).decode_utf8_lossy().to_string(),
                percent_decode_str(v).decode_utf8_lossy().to_string(),
            )
        })
        .collect();

    UrlParts {
        scheme,
        host,
        port,
        path,
        fragment,
        query,
        error: None,
    }
}

impl UrlParts {
    fn empty(error: Option<String>) -> Self {
        Self {
            scheme: String::new(),
            host: String::new(),
            port: String::new(),
            path: String::new(),
            fragment: String::new(),
            query: Vec::new(),
            error,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_chinese() {
        let enc = url_encode("你好 world".into());
        assert_eq!(url_decode(enc), "你好 world");
    }

    #[test]
    fn parses_parts() {
        let p = url_parse("https://example.com:8443/a/b?x=1&y=%E4%BD%A0#top".into());
        assert_eq!(p.scheme, "https");
        assert_eq!(p.host, "example.com");
        assert_eq!(p.port, "8443");
        assert_eq!(p.path, "/a/b");
        assert_eq!(p.query.len(), 2);
        assert_eq!(p.query[1].1, "你");
        assert_eq!(p.fragment, "top");
    }
}
