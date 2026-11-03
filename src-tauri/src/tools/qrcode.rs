use qrcode::QrCode;
use qrcode::render::svg;

/// 直接返回 SVG 字符串，前端用 dangerouslySetInnerHTML 渲染。
/// 矢量图在任何缩放下都清晰，比生成 PNG 再缩放省事。
#[tauri::command]
pub fn qr_svg(text: String, size: u32, dark: String, light: String) -> Result<String, String> {
    if text.trim().is_empty() {
        return Err("请输入要编码的内容".into());
    }
    let code = QrCode::new(text.as_bytes()).map_err(|e| format!("内容太长或无法编码：{e}"))?;
    let dim = size.clamp(80, 1024);
    let svg = code
        .render::<svg::Color>()
        .min_dimensions(dim, dim)
        .dark_color(svg::Color(&dark))
        .light_color(svg::Color(&light))
        .build();
    Ok(svg)
}

/// 生成 PNG 并写到用户选好的路径
#[tauri::command]
pub fn save_qr(text: String, path: String, size: u32) -> Result<(), String> {
    let code = QrCode::new(text.as_bytes()).map_err(|e| format!("内容无法编码：{e}"))?;
    let dim = size.clamp(160, 2048);
    let img = code
        .render::<image::Luma<u8>>()
        .min_dimensions(dim, dim)
        .build();
    img.save(&path).map_err(|e| format!("保存失败：{e}"))
}
