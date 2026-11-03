use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::Serialize;

#[derive(Serialize)]
pub struct JwtParts {
    pub header: String,
    pub payload: String,
    pub signature: String,
    pub alg: String,
    pub error: Option<String>,
}

fn decode_segment(seg: &str) -> Result<String, String> {
    let bytes = URL_SAFE_NO_PAD
        .decode(seg)
        .map_err(|e| format!("Base64URL 解码失败：{e}"))?;
    let text = String::from_utf8(bytes).map_err(|_| "片段不是合法 UTF-8".to_string())?;
    // 美化 JSON，失败就原样返回
    match serde_json::from_str::<serde_json::Value>(&text) {
        Ok(v) => Ok(serde_json::to_string_pretty(&v).unwrap_or(text)),
        Err(_) => Ok(text),
    }
}

#[tauri::command]
pub fn jwt_decode(token: String) -> JwtParts {
    let t = token.trim();
    if t.is_empty() {
        return JwtParts::err("请输入 JWT");
    }
    let segs: Vec<&str> = t.split('.').collect();
    if segs.len() != 3 {
        return JwtParts::err(format!(
            "JWT 应该是 3 段（header.payload.signature），当前 {} 段",
            segs.len()
        ));
    }

    let header = match decode_segment(segs[0]) {
        Ok(v) => v,
        Err(e) => return JwtParts::err(e),
    };
    let payload = match decode_segment(segs[1]) {
        Ok(v) => v,
        Err(e) => return JwtParts::err(e),
    };

    let alg = serde_json::from_str::<serde_json::Value>(&header)
        .ok()
        .and_then(|v| v.get("alg").and_then(|a| a.as_str()).map(str::to_string))
        .unwrap_or_else(|| "?".into());

    JwtParts {
        header,
        payload,
        signature: segs[2].to_string(),
        alg,
        error: None,
    }
}

impl JwtParts {
    fn err(msg: impl Into<String>) -> Self {
        Self {
            header: String::new(),
            payload: String::new(),
            signature: String::new(),
            alg: String::new(),
            error: Some(msg.into()),
        }
    }
}
