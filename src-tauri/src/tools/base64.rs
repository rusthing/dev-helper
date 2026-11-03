use base64::Engine;
use base64::engine::general_purpose::{STANDARD, STANDARD_NO_PAD, URL_SAFE, URL_SAFE_NO_PAD};

#[tauri::command]
pub fn base64_encode(text: String, url_safe: bool, no_pad: bool) -> String {
    let engine = match (url_safe, no_pad) {
        (false, false) => &STANDARD,
        (false, true) => &STANDARD_NO_PAD,
        (true, false) => &URL_SAFE,
        (true, true) => &URL_SAFE_NO_PAD,
    };
    engine.encode(text.as_bytes())
}

#[tauri::command]
pub fn base64_decode(text: String, url_safe: bool) -> Result<String, String> {
    let engine = if url_safe { &URL_SAFE } else { &STANDARD };
    // 粘贴过来的 Base64 常带换行和空格，先剔掉
    let cleaned: String = text.chars().filter(|c| !c.is_whitespace()).collect();
    if cleaned.is_empty() {
        return Ok(String::new());
    }
    let bytes = engine.decode(&cleaned).or_else(|_| {
        // 容错：缺 padding 时补齐再试一次
        let mut s = cleaned.clone();
        while s.len() % 4 != 0 {
            s.push('=');
        }
        engine.decode(s)
    });
    let bytes = bytes.map_err(|e| format!("Base64 解码失败：{e}"))?;
    String::from_utf8(bytes).map_err(|_| "解码结果不是合法的 UTF-8 文本（可能是二进制数据）".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let enc = base64_encode("你好, dev-helper".into(), false, false);
        let dec = base64_decode(enc, false).unwrap();
        assert_eq!(dec, "你好, dev-helper");
    }

    #[test]
    fn missing_padding_is_tolerated() {
        assert_eq!(base64_decode("aGVsbG8".into(), false).unwrap(), "hello");
    }
}
