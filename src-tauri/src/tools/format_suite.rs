use percent_encoding::percent_decode_str;
use quick_xml::Reader;
use quick_xml::events::Event;

/// 统一入口：XML / HTML / CSS / SCSS / YAML / Markdown 格式化。
///
/// 每个格式都是「能安全整理就整理」的保守策略：不改写语义，
/// 只处理缩进、换行与首尾空白；解析不了时明确返回错误。
#[tauri::command]
pub fn text_format(kind: String, text: String, indent: usize) -> Result<String, String> {
    if text.trim().is_empty() {
        return Ok(String::new());
    }
    let width = indent.clamp(1, 8);
    match kind.as_str() {
        "xml" => format_xml(&text, width),
        "html" => format_html(&text, width),
        "css" | "scss" => format_css(&text, width),
        "yaml" => format_yaml(&text),
        "markdown" => Ok(format_markdown(&text)),
        other => Err(format!("不支持的格式：{other}")),
    }
}

// ---------------------------------------------------------------------------
// 通用标签扫描
// ---------------------------------------------------------------------------

#[derive(Debug, PartialEq)]
enum Token {
    Open {
        raw: String,
        name: String,
        self_closing: bool,
    },
    Close(String),
    Text(String),
    Comment(String),
    Cdata(String),
    Decl(String),
    Raw(String),
}

fn tag_name(raw: &str) -> String {
    let inner = raw
        .trim_start_matches('<')
        .trim_start_matches('/')
        .trim_end_matches('>')
        .trim_end_matches('/')
        .trim();
    inner
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_string()
}

fn find_tag_end(chars: &[char], start: usize) -> Option<usize> {
    let mut quote: Option<char> = None;
    let mut i = start;
    while i < chars.len() {
        let c = chars[i];
        match quote {
            Some(q) if c == q => quote = None,
            Some(_) => {}
            None if c == '"' || c == '\'' => quote = Some(c),
            None if c == '>' => return Some(i + 1),
            _ => {}
        }
        i += 1;
    }
    None
}

fn scan_tags(text: &str, raw_blocks: &[&str]) -> Result<Vec<Token>, String> {
    let chars: Vec<char> = text.chars().collect();
    let mut tokens = Vec::new();
    let mut i = 0;
    let mut buf = String::new();

    while i < chars.len() {
        if chars[i] != '<' {
            buf.push(chars[i]);
            i += 1;
            continue;
        }
        if !buf.is_empty() {
            tokens.push(Token::Text(buf.trim().to_string()));
            buf.clear();
        }
        // 注释 / CDATA / 声明
        if chars[i..].starts_with(&['<', '!', '-', '-']) {
            let end = text[i..]
                .find("-->")
                .map(|p| i + p + 3)
                .ok_or_else(|| "注释没有闭合（缺少 -->）".to_string())?;
            tokens.push(Token::Comment(chars[i..end].iter().collect()));
            i = end;
            continue;
        }
        if chars[i..].starts_with(&['<', '!', '[', 'C', 'D', 'A', 'T', 'A', '[']) {
            let end = text[i..]
                .find("]]>")
                .map(|p| i + p + 3)
                .ok_or_else(|| "CDATA 没有闭合（缺少 ]]>）".to_string())?;
            tokens.push(Token::Cdata(chars[i..end].iter().collect()));
            i = end;
            continue;
        }
        if chars[i..].starts_with(&['<', '!']) || chars[i..].starts_with(&['<', '?']) {
            let end = find_tag_end(&chars, i).ok_or_else(|| "声明没有闭合".to_string())?;
            tokens.push(Token::Decl(chars[i..end].iter().collect()));
            i = end;
            continue;
        }

        let end = find_tag_end(&chars, i).ok_or_else(|| "标签没有闭合（缺少 >）".to_string())?;
        let raw: String = chars[i..end].iter().collect();
        if raw.starts_with("</") {
            tokens.push(Token::Close(tag_name(&raw)));
            i = end;
            continue;
        }

        let name = tag_name(&raw);
        let self_closing = raw.trim_end().ends_with("/>");
        tokens.push(Token::Open {
            raw: raw.clone(),
            name: name.clone(),
            self_closing,
        });
        i = end;

        // script / style / pre / textarea 里的 < 不是标签，整段原样保留
        if !self_closing && raw_blocks.iter().any(|b| b.eq_ignore_ascii_case(&name)) {
            let lower = text[i..].to_ascii_lowercase();
            if let Some(pos) = lower.find(&format!("</{}", name.to_ascii_lowercase())) {
                let raw_end = i + pos;
                if raw_end > i {
                    tokens.push(Token::Raw(chars[i..raw_end].iter().collect()));
                }
                i = raw_end;
            }
        }
    }
    if !buf.trim().is_empty() {
        tokens.push(Token::Text(buf.trim().to_string()));
    }
    Ok(tokens)
}

fn indent_line(depth: usize, width: usize, s: &str) -> String {
    format!("{}{s}", " ".repeat(depth * width))
}

/// 校验 XML 是否良构；真正的排版交给保守的标签扫描，保留原始属性写法。
fn validate_xml(text: &str) -> Result<(), String> {
    let mut reader = Reader::from_str(text);
    reader.config_mut().trim_text(false);
    let mut depth = 0usize;
    loop {
        match reader.read_event() {
            Err(e) => return Err(format!("XML 解析失败：{e}")),
            Ok(Event::Eof) => break,
            Ok(Event::Start(_)) => depth += 1,
            Ok(Event::End(_)) => {
                depth = depth
                    .checked_sub(1)
                    .ok_or_else(|| "多余的结束标签".to_string())?;
            }
            _ => {}
        }
    }
    if depth != 0 {
        return Err("XML 标签没有正确闭合".into());
    }
    Ok(())
}

fn format_xml(text: &str, width: usize) -> Result<String, String> {
    validate_xml(text)?;
    let tokens = scan_tags(text, &[])?;
    tokens_to_lines(&tokens, width, false)
}

fn tokens_to_lines(tokens: &[Token], width: usize, html: bool) -> Result<String, String> {
    const VOID: &[&str] = &[
        "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param",
        "source", "track", "wbr",
    ];

    let mut lines: Vec<String> = Vec::new();
    let mut depth = 0usize;
    let mut i = 0;
    while i < tokens.len() {
        match &tokens[i] {
            Token::Text(t) => {
                if !t.is_empty() {
                    lines.push(indent_line(depth, width, t));
                }
                i += 1;
            }
            Token::Open {
                raw,
                name,
                self_closing,
            } => {
                let is_void = html && VOID.iter().any(|v| v.eq_ignore_ascii_case(name));
                if *self_closing || is_void {
                    lines.push(indent_line(depth, width, raw));
                    i += 1;
                    continue;
                }
                // <tag>text</tag> 这种单行结构保持一行
                if i + 2 < tokens.len() {
                    if let (Token::Text(t), Token::Close(c)) = (&tokens[i + 1], &tokens[i + 2]) {
                        if !t.is_empty() && !t.contains('\n') && c.eq_ignore_ascii_case(name) {
                            let inline = format!("{raw}{}</{name}>", t.trim());
                            lines.push(indent_line(depth, width, &inline));
                            i += 3;
                            continue;
                        }
                    }
                }
                lines.push(indent_line(depth, width, raw));
                depth += 1;
                i += 1;
            }
            Token::Raw(t) => {
                for line in t.lines() {
                    if line.trim().is_empty() {
                        lines.push(String::new());
                    } else {
                        lines.push(indent_line(depth, width, line));
                    }
                }
                i += 1;
            }
            Token::Close(name) => {
                depth = depth.saturating_sub(1);
                lines.push(indent_line(depth, width, &format!("</{name}>")));
                i += 1;
            }
            Token::Comment(t) | Token::Decl(t) => {
                lines.push(indent_line(depth, width, t));
                i += 1;
            }
            Token::Cdata(t) => {
                for line in t.lines() {
                    lines.push(indent_line(depth, width, line));
                }
                i += 1;
            }
        }
    }

    Ok(lines.join("\n").trim_end().to_string())
}

fn format_html(text: &str, width: usize) -> Result<String, String> {
    let tokens = scan_tags(text, &["script", "style", "pre", "textarea"])?;
    tokens_to_lines(&tokens, width, true)
}

// ---------------------------------------------------------------------------
// CSS / SCSS
// ---------------------------------------------------------------------------

fn format_css(text: &str, width: usize) -> Result<String, String> {
    let chars: Vec<char> = text.chars().collect();
    let mut lines: Vec<String> = Vec::new();
    let mut line = String::new();
    let mut depth = 0usize;
    let mut paren = 0i32;
    let mut i = 0;

    let push_line = |lines: &mut Vec<String>, line: &mut String, depth: usize| {
        let t = line.trim();
        if !t.is_empty() {
            lines.push(format!("{}{}", " ".repeat(depth * width), t));
        }
        line.clear();
    };

    while i < chars.len() {
        let c = chars[i];
        let next = chars.get(i + 1).copied();
        // 字符串整体保留
        if c == '"' || c == '\'' {
            let quote = c;
            line.push(c);
            i += 1;
            while i < chars.len() {
                line.push(chars[i]);
                if chars[i] == '\\' {
                    if let Some(n) = chars.get(i + 1) {
                        line.push(*n);
                        i += 2;
                        continue;
                    }
                }
                if chars[i] == quote {
                    i += 1;
                    break;
                }
                i += 1;
            }
            continue;
        }
        // 注释
        if c == '/' && next == Some('*') {
            push_line(&mut lines, &mut line, depth);
            let mut comment = String::new();
            while i < chars.len() {
                comment.push(chars[i]);
                if chars[i] == '*' && chars.get(i + 1) == Some(&'/') {
                    comment.push('/');
                    i += 2;
                    break;
                }
                i += 1;
            }
            for l in comment.lines() {
                lines.push(format!("{}{}", " ".repeat(depth * width), l.trim()));
            }
            continue;
        }
        if c == '/' && next == Some('/') {
            push_line(&mut lines, &mut line, depth);
            let mut comment = String::new();
            while i < chars.len() && chars[i] != '\n' {
                comment.push(chars[i]);
                i += 1;
            }
            lines.push(format!("{}{}", " ".repeat(depth * width), comment.trim()));
            continue;
        }
        match c {
            '{' => {
                line = line.trim_end().to_string();
                line.push_str(" {");
                push_line(&mut lines, &mut line, depth);
                depth += 1;
                i += 1;
            }
            '}' => {
                push_line(&mut lines, &mut line, depth);
                depth = depth
                    .checked_sub(1)
                    .ok_or_else(|| "CSS 里出现了多余的右花括号".to_string())?;
                lines.push(format!("{}}}", " ".repeat(depth * width)));
                i += 1;
            }
            ';' if paren == 0 => {
                line.push(';');
                push_line(&mut lines, &mut line, depth);
                i += 1;
            }
            '(' => {
                paren += 1;
                line.push(c);
                i += 1;
            }
            ')' => {
                paren = (paren - 1).max(0);
                line.push(c);
                i += 1;
            }
            ':' => {
                let is_property = !line.is_empty()
                    && line.chars().all(|c| {
                        c.is_alphanumeric() || matches!(c, '-' | '_' | '$')
                    });
                line.push(':');
                if depth > 0 && is_property && next != Some(' ') && next != Some('\n') {
                    line.push(' ');
                }
                i += 1;
            }
            '\n' | '\r' | '\t' => {
                if !line.ends_with(' ') && !line.is_empty() {
                    line.push(' ');
                }
                i += 1;
            }
            ' ' => {
                if !line.ends_with(' ') && !line.is_empty() {
                    line.push(' ');
                }
                i += 1;
            }
            _ => {
                line.push(c);
                i += 1;
            }
        }
    }
    push_line(&mut lines, &mut line, depth);
    if depth != 0 {
        return Err("CSS 花括号没有闭合".into());
    }
    Ok(lines.join("\n").trim_end().to_string())
}

// ---------------------------------------------------------------------------
// YAML / Markdown / URL 参数
// ---------------------------------------------------------------------------

fn format_yaml(text: &str) -> Result<String, String> {
    let v: serde_yaml::Value =
        serde_yaml::from_str(text).map_err(|e| format!("YAML 语法错误：{e}"))?;
    serde_yaml::to_string(&v).map_err(|e| format!("YAML 生成失败：{e}"))
}

fn format_markdown(text: &str) -> String {
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    let mut out: Vec<String> = Vec::new();
    let mut blank = 0usize;
    for line in normalized.split('\n') {
        let trimmed = line.trim_end();
        if trimmed.is_empty() {
            blank += 1;
            if blank <= 1 {
                out.push(String::new());
            }
            continue;
        }
        blank = 0;
        // `#标题` 补一个空格，符合 CommonMark 的标题写法
        let mut fixed = String::new();
        let hashes = trimmed.chars().take_while(|c| *c == '#').count();
        if (1..=6).contains(&hashes) {
            let rest = &trimmed[hashes..];
            if !rest.is_empty() && !rest.starts_with(' ') {
                fixed.push_str(&"#".repeat(hashes));
                fixed.push(' ');
                fixed.push_str(rest);
            } else {
                fixed.push_str(trimmed);
            }
        } else {
            fixed.push_str(trimmed);
        }
        out.push(fixed);
    }
    let mut s = out.join("\n");
    s = s.trim_end_matches('\n').to_string();
    s.push('\n');
    s
}

/// # URL 查询参数格式化
///
/// 输入可以是完整 URL、`?a=1&b=2` 或裸查询串；输出每条参数一行并做解码。
/// 重复参数保留原顺序，`sort` 为 true 时按键排序。
#[tauri::command]
pub fn url_params_format(text: String, sort: bool) -> String {
    let mut s = text.trim();
    if let Some(pos) = s.find('#') {
        s = &s[..pos];
    }
    if let Some(pos) = s.find('?') {
        s = &s[pos + 1..];
    }
    let s = s.trim_start_matches('?');
    if s.is_empty() {
        return String::new();
    }

    let mut params: Vec<(String, String)> = s
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

    if sort {
        params.sort_by(|a, b| a.0.cmp(&b.0));
    }
    let key_width = params
        .iter()
        .map(|(k, _)| k.chars().count())
        .max()
        .unwrap_or(0);

    params
        .iter()
        .map(|(k, v)| {
            let pad = " ".repeat(key_width.saturating_sub(k.chars().count()));
            format!("{k}{pad} = {v}")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn xml_pretty_print() {
        let out = text_format(
            "xml".into(),
            "<root><a x=\"1\">v</a><b><c/></b></root>".into(),
            2,
        )
        .unwrap();
        assert_eq!(
            out,
            "<root>\n  <a x=\"1\">v</a>\n  <b>\n    <c/>\n  </b>\n</root>"
        );
    }

    #[test]
    fn xml_rejects_broken_input() {
        assert!(text_format("xml".into(), "<a><b></a>".into(), 2).is_err());
    }

    #[test]
    fn html_handles_void_and_raw() {
        let out = text_format(
            "html".into(),
            "<div><img src=x><script>if (a < b) { x(); }</script><p>hi</p></div>".into(),
            2,
        )
        .unwrap();
        assert!(out.contains("<img src=x>"));
        assert!(out.contains("if (a < b) { x(); }"));
    }

    #[test]
    fn css_indents_blocks() {
        let out = text_format("css".into(), ".a{color:red;background:url(a;b)}".into(), 2)
            .unwrap();
        assert_eq!(out, ".a {\n  color: red;\n  background: url(a;b)\n}");
    }

    #[test]
    fn css_rejects_unclosed_block() {
        assert!(text_format("css".into(), ".a{color:red".into(), 2).is_err());
    }

    #[test]
    fn markdown_tidies_blank_lines() {
        let out = text_format(
            "markdown".into(),
            "#标题   \n\n\n\n正文   \n\n".into(),
            2,
        )
        .unwrap();
        assert_eq!(out, "# 标题\n\n正文\n");
    }

    #[test]
    fn url_params_decode_and_align() {
        let out = url_params_format(
            "https://x.com/p?name=%E5%BC%A0%E4%B8%89&age=18".into(),
            false,
        );
        assert!(out.contains("name = 张三"));
        assert!(out.contains("age  = 18"));
    }
}
