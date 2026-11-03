mod tools;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|_app| {
            // 启动自检：把几条已知答案的输入跑一遍，日志里能直接看到对不对
            let ts = tools::timestamp::convert_timestamp("1793605102".into());
            println!(
                "[self-check] timestamp millis={:?} units={} zones={}",
                ts.millis,
                ts.units.len(),
                ts.zones.len()
            );
            let md5 = tools::hash::hash_text("abc".into(), vec!["md5".into()], false);
            println!("[self-check] md5(abc)={}", md5[0].output);
            let b64 = tools::base64::base64_encode("hello".into(), false, false);
            println!("[self-check] base64(hello)={}", b64);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 时间
            tools::timestamp::convert_timestamp,
            // 哈希
            tools::hash::hash_text,
            tools::hash::hmac_text,
            // Base64
            tools::base64::base64_encode,
            tools::base64::base64_decode,
            // URL
            tools::url::url_encode,
            tools::url::url_decode,
            tools::url::url_parse,
            // JWT
            tools::jwt::jwt_decode,
            // 密码
            tools::password::gen_password,
            tools::password::password_strength,
            // UUID
            tools::uuid::gen_uuid,
            // 二维码
            tools::qrcode::qr_svg,
            tools::qrcode::save_qr,
            // JSON
            tools::json::json_format,
            tools::json::json_size,
            // SQL
            tools::format::sql_format,
            // JS
            tools::js_format::js_format,
            // 键值文本
            tools::kv::kv_to_json,
            // 正则
            tools::regex::regex_test,
            // 对比
            tools::diff::text_diff,
            // 文本
            tools::text::text_stats,
            tools::text::text_transform,
            // 颜色
            tools::color::color_parse,
            tools::color::contrast_ratio,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
