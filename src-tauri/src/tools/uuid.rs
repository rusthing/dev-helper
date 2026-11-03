use uuid::Uuid;

#[tauri::command]
pub fn gen_uuid(count: usize, v7: bool, upper: bool, braces: bool, hyphens: bool) -> Vec<String> {
    let n = count.clamp(1, 200);
    (0..n)
        .map(|_| {
            let mut s = if v7 {
                Uuid::now_v7().to_string()
            } else {
                Uuid::new_v4().to_string()
            };
            if !hyphens {
                s = s.replace('-', "");
            }
            if upper {
                s = s.to_uppercase();
            }
            if braces {
                s = format!("{{{s}}}");
            }
            s
        })
        .collect()
}
