#[tauri::command]
pub fn sql_format(text: String, upper: bool, indent: usize) -> String {
    if text.trim().is_empty() {
        return String::new();
    }
    let opts = sqlformat::FormatOptions {
        indent: sqlformat::Indent::Spaces(indent.clamp(1, 8) as u8),
        uppercase: Some(upper),
        ..Default::default()
    };
    sqlformat::format(&text, &sqlformat::QueryParams::None, &opts)
}
