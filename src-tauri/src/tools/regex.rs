use regex::RegexBuilder;
use serde::Serialize;

#[derive(Serialize)]
pub struct RegexMatch {
    pub start: usize,
    pub end: usize,
    pub text: String,
    pub groups: Vec<String>,
}

#[derive(Serialize)]
pub struct RegexResult {
    pub matches: Vec<RegexMatch>,
    pub error: Option<String>,
}

#[tauri::command]
pub fn regex_test(
    pattern: String,
    text: String,
    ignore_case: bool,
    multi_line: bool,
    dot_all: bool,
) -> RegexResult {
    if pattern.is_empty() {
        return RegexResult { matches: Vec::new(), error: None };
    }
    let re = match RegexBuilder::new(&pattern)
        .case_insensitive(ignore_case)
        .multi_line(multi_line)
        .dot_matches_new_line(dot_all)
        .size_limit(10 * 1024 * 1024)
        .build()
    {
        Ok(r) => r,
        Err(e) => {
            return RegexResult {
                matches: Vec::new(),
                error: Some(format!("正则语法错误：{e}")),
            };
        }
    };

    let matches = re
        .captures_iter(&text)
        .take(2000)
        .filter_map(|caps| {
            let m = caps.get(0)?;
            Some(RegexMatch {
                start: m.start(),
                end: m.end(),
                text: m.as_str().to_string(),
                groups: caps
                    .iter()
                    .skip(1)
                    .map(|g| g.map(|x| x.as_str().to_string()).unwrap_or_default())
                    .collect(),
            })
        })
        .collect();

    RegexResult { matches, error: None }
}
