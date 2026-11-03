use dprint_plugin_typescript::configuration::{
    Configuration, ConfigurationBuilder, QuoteStyle, SemiColons,
};
use dprint_plugin_typescript::{format_text, FormatTextOptions};
use std::path::Path;

/// 统一按 `.tsx` 解析：它是超集，普通 JS、TS 类型、JSX 都能吃下
/// （代价是泛型箭头函数会被规范成 `<T,>`，这正是 TSX 的语法要求）
const PARSE_AS: &str = "input.tsx";

fn quote_style_of(v: &str) -> QuoteStyle {
    match v {
        "single" => QuoteStyle::AlwaysSingle,
        "prefer-single" => QuoteStyle::PreferSingle,
        "double" => QuoteStyle::AlwaysDouble,
        _ => QuoteStyle::PreferDouble,
    }
}

fn semicolons_of(v: &str) -> SemiColons {
    match v {
        "asi" => SemiColons::Asi,
        "always" => SemiColons::Always,
        _ => SemiColons::Prefer,
    }
}

fn build_config(indent: usize, line_width: usize, quote: &str, semi: &str) -> Configuration {
    ConfigurationBuilder::new()
        .indent_width(indent.clamp(1, 8) as u8)
        .line_width(line_width.clamp(40, 160) as u32)
        .quote_style(quote_style_of(quote))
        .semi_colons(semicolons_of(semi))
        .build()
}

/// # 格式化 JavaScript / TypeScript / JSX
///
/// 底层是 dprint 的 TypeScript 插件（解析用 swc，输出风格对齐 Prettier）。
///
/// ## 参数
/// - `text`：源码
/// - `indent`：缩进宽度，1..=8
/// - `line_width`：换行列宽，40..=160
/// - `quote_style`：`double` / `single` / `prefer-double` / `prefer-single`
/// - `semicolons`：`prefer` / `always` / `asi`（asi = 尽量不加分号）
///
/// ## 返回
/// 格式化后的源码；语法错误时返回带行列号的提示。
#[tauri::command]
pub fn js_format(
    text: String,
    indent: usize,
    line_width: usize,
    quote_style: String,
    semicolons: String,
) -> Result<String, String> {
    if text.trim().is_empty() {
        return Ok(String::new());
    }
    let config = build_config(indent, line_width, &quote_style, &semicolons);
    match format_text(FormatTextOptions {
        path: Path::new(PARSE_AS),
        extension: None,
        text,
        config: &config,
        external_formatter: None,
    }) {
        Ok(Some(out)) => Ok(out),
        // None 表示内容命中了 `// dprint-ignore-file`
        Ok(None) => Ok(String::new()),
        Err(e) => Err(format!("语法错误：{e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fmt(src: &str) -> String {
        js_format(src.into(), 2, 80, "prefer-single".into(), "prefer".into()).unwrap()
    }

    #[test]
    fn expands_one_liners_with_two_space_indent() {
        let out = fmt("const a={b:1,c:[1,2]};function f(x,y){return x+y}");
        assert_eq!(
            out,
            "const a = { b: 1, c: [1, 2] };\nfunction f(x, y) {\n  return x + y;\n}\n"
        );
    }

    #[test]
    fn respects_quote_style() {
        assert!(fmt(r#"const s = "hi";"#).contains("'hi'"));
        let out = js_format(r#"const s = "hi";"#.into(), 2, 80, "double".into(), "prefer".into());
        assert!(out.unwrap().contains("\"hi\""));
    }

    #[test]
    fn asi_drops_semicolons() {
        let out = js_format("const a = 1;\nconst b = 2;\n".into(), 2, 80, "prefer-double".into(), "asi".into())
            .unwrap();
        assert!(!out.contains(';'), "asi 模式不应保留分号：{out}");
    }

    #[test]
    fn keeps_template_literals_and_regex_intact() {
        let out = fmt("const t=`a${b}c`;const re=/ab+c/gi;");
        assert!(out.contains("`a${b}c`"));
        assert!(out.contains("/ab+c/gi"));
    }

    #[test]
    fn reports_syntax_error_with_position() {
        let err = js_format("const = ;".into(), 2, 80, "prefer-double".into(), "prefer".into())
            .unwrap_err();
        assert!(err.starts_with("语法错误"), "{err}");
    }

    #[test]
    fn empty_input_is_empty_output() {
        assert_eq!(fmt("   \n  "), "");
    }
}
