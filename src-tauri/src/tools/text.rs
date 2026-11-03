use serde::Serialize;

#[derive(Serialize)]
pub struct TextStats {
    pub chars: usize,
    pub chars_no_space: usize,
    pub words: usize,
    pub lines: usize,
    pub bytes: usize,
}

#[tauri::command]
pub fn text_stats(text: String) -> TextStats {
    TextStats {
        chars: text.chars().count(),
        chars_no_space: text.chars().filter(|c| !c.is_whitespace()).count(),
        words: text.split_whitespace().count(),
        lines: if text.is_empty() { 0 } else { text.lines().count() },
        bytes: text.len(),
    }
}

fn split_words(text: &str) -> Vec<String> {
    // 同时按空白、下划线、连字符切，并把 camelCase 拆开
    let mut words = Vec::new();
    for chunk in text.split(|c: char| c.is_whitespace() || c == '_' || c == '-' || c == '.') {
        if chunk.is_empty() {
            continue;
        }
        let mut cur = String::new();
        let mut prev_lower = false;
        for ch in chunk.chars() {
            if ch.is_uppercase() && prev_lower {
                if !cur.is_empty() {
                    words.push(std::mem::take(&mut cur));
                }
            }
            prev_lower = ch.is_lowercase() || ch.is_numeric();
            cur.push(ch);
        }
        if !cur.is_empty() {
            words.push(cur);
        }
    }
    words
}

#[tauri::command]
pub fn text_transform(text: String, op: String) -> String {
    match op.as_str() {
        "upper" => text.to_uppercase(),
        "lower" => text.to_lowercase(),
        "title" => text
            .split_whitespace()
            .map(|w| {
                let mut cs = w.chars();
                match cs.next() {
                    Some(f) => f.to_uppercase().collect::<String>() + cs.as_str(),
                    None => String::new(),
                }
            })
            .collect::<Vec<_>>()
            .join(" "),
        "snake" => split_words(&text)
            .iter()
            .map(|w| w.to_lowercase())
            .collect::<Vec<_>>()
            .join("_"),
        "kebab" => split_words(&text)
            .iter()
            .map(|w| w.to_lowercase())
            .collect::<Vec<_>>()
            .join("-"),
        "camel" => {
            let ws = split_words(&text);
            let mut out = String::new();
            for (i, w) in ws.iter().enumerate() {
                let lower = w.to_lowercase();
                if i == 0 {
                    out.push_str(&lower);
                } else {
                    let mut cs = lower.chars();
                    if let Some(f) = cs.next() {
                        out.push_str(&f.to_uppercase().collect::<String>());
                        out.push_str(cs.as_str());
                    }
                }
            }
            out
        }
        "pascal" => split_words(&text)
            .iter()
            .map(|w| {
                let lower = w.to_lowercase();
                let mut cs = lower.chars();
                match cs.next() {
                    Some(f) => f.to_uppercase().collect::<String>() + cs.as_str(),
                    None => String::new(),
                }
            })
            .collect::<String>(),
        "trim" => text.trim().to_string(),
        "trim-lines" => text
            .lines()
            .map(str::trim)
            .collect::<Vec<_>>()
            .join("\n"),
        "remove-empty" => text
            .lines()
            .filter(|l| !l.trim().is_empty())
            .collect::<Vec<_>>()
            .join("\n"),
        "dedup-lines" => {
            let mut seen = std::collections::HashSet::new();
            text.lines()
                .filter(|l| seen.insert(l.to_string()))
                .collect::<Vec<_>>()
                .join("\n")
        }
        "sort-lines" => {
            let mut lines: Vec<&str> = text.lines().collect();
            lines.sort();
            lines.join("\n")
        }
        "sort-lines-desc" => {
            let mut lines: Vec<&str> = text.lines().collect();
            lines.sort();
            lines.reverse();
            lines.join("\n")
        }
        "reverse-lines" => {
            let mut lines: Vec<&str> = text.lines().collect();
            lines.reverse();
            lines.join("\n")
        }
        "reverse" => text.chars().rev().collect(),
        _ => text,
    }
}
