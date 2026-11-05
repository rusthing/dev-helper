use serde::Serialize;

#[derive(Serialize)]
pub struct ColorInfo {
    pub hex: String,
    pub hex8: String,
    pub rgb: String,
    pub hsl: String,
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: u8,
    pub error: Option<String>,
}

fn err(msg: impl Into<String>) -> ColorInfo {
    ColorInfo {
        hex: String::new(),
        hex8: String::new(),
        rgb: String::new(),
        hsl: String::new(),
        r: 0,
        g: 0,
        b: 0,
        a: 255,
        error: Some(msg.into()),
    }
}

fn parse_hex(s: &str) -> Option<(u8, u8, u8, u8)> {
    let h = s.trim_start_matches('#');
    let full = match h.len() {
        3 => format!(
            "{}{}{}{}{}{}",
            &h[0..1],
            &h[0..1],
            &h[1..2],
            &h[1..2],
            &h[2..3],
            &h[2..3]
        ),
        4 => format!(
            "{}{}{}{}{}{}{}{}",
            &h[0..1],
            &h[0..1],
            &h[1..2],
            &h[1..2],
            &h[2..3],
            &h[2..3],
            &h[3..4],
            &h[3..4]
        ),
        6 => h.to_string(),
        8 => h.to_string(),
        _ => return None,
    };
    let r = u8::from_str_radix(&full[0..2], 16).ok()?;
    let g = u8::from_str_radix(&full[2..4], 16).ok()?;
    let b = u8::from_str_radix(&full[4..6], 16).ok()?;
    let a = if full.len() == 8 {
        u8::from_str_radix(&full[6..8], 16).ok()?
    } else {
        255
    };
    Some((r, g, b, a))
}

fn parse_rgb(s: &str) -> Option<(u8, u8, u8, u8)> {
    let inner = s
        .trim()
        .strip_prefix("rgb(")
        .or_else(|| s.trim().strip_prefix("rgba("))?
        .strip_suffix(')')?;
    let parts: Vec<&str> = inner.split(',').map(str::trim).collect();
    if parts.len() < 3 {
        return None;
    }
    let r = parts[0].parse::<u8>().ok()?;
    let g = parts[1].parse::<u8>().ok()?;
    let b = parts[2].parse::<u8>().ok()?;
    let a = parts
        .get(3)
        .and_then(|v| v.parse::<f32>().ok())
        .map(|v| (v.clamp(0.0, 1.0) * 255.0).round() as u8)
        .unwrap_or(255);
    Some((r, g, b, a))
}

fn hsl_to_rgb(h: f64, s: f64, l: f64) -> (u8, u8, u8) {
    let h = h.rem_euclid(360.0);
    let s = (s / 100.0).clamp(0.0, 1.0);
    let l = (l / 100.0).clamp(0.0, 1.0);
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let x = c * (1.0 - ((h / 60.0) % 2.0 - 1.0).abs());
    let m = l - c / 2.0;
    let (r, g, b) = if h < 60.0 {
        (c, x, 0.0)
    } else if h < 120.0 {
        (x, c, 0.0)
    } else if h < 180.0 {
        (0.0, c, x)
    } else if h < 240.0 {
        (0.0, x, c)
    } else if h < 300.0 {
        (x, 0.0, c)
    } else {
        (c, 0.0, x)
    };
    (
        ((r + m) * 255.0).round() as u8,
        ((g + m) * 255.0).round() as u8,
        ((b + m) * 255.0).round() as u8,
    )
}

fn parse_hsl(s: &str) -> Option<(u8, u8, u8, u8)> {
    let inner = s
        .trim()
        .strip_prefix("hsl(")
        .or_else(|| s.trim().strip_prefix("hsla("))?
        .strip_suffix(')')?;
    let parts: Vec<&str> = inner.split(',').map(str::trim).collect();
    if parts.len() < 3 {
        return None;
    }
    let h = parts[0]
        .trim_end_matches("deg")
        .parse::<f64>()
        .ok()?;
    let sat = parts[1].trim_end_matches('%').parse::<f64>().ok()?;
    let l = parts[2].trim_end_matches('%').parse::<f64>().ok()?;
    if !(0.0..=100.0).contains(&sat) || !(0.0..=100.0).contains(&l) {
        return None;
    }
    let a = parts
        .get(3)
        .and_then(|v| {
            if let Some(p) = v.strip_suffix('%') {
                p.parse::<f64>().ok().map(|p| p / 100.0)
            } else {
                v.parse::<f64>().ok()
            }
        })
        .map(|v| (v.clamp(0.0, 1.0) * 255.0).round() as u8)
        .unwrap_or(255);
    let (r, g, b) = hsl_to_rgb(h, sat, l);
    Some((r, g, b, a))
}

fn rgb_to_hsl(r: u8, g: u8, b: u8) -> (f64, f64, f64) {
    let (rf, gf, bf) = (r as f64 / 255.0, g as f64 / 255.0, b as f64 / 255.0);
    let max = rf.max(gf).max(bf);
    let min = rf.min(gf).min(bf);
    let l = (max + min) / 2.0;
    if (max - min).abs() < f64::EPSILON {
        return (0.0, 0.0, l * 100.0);
    }
    let d = max - min;
    let s = if l > 0.5 {
        d / (2.0 - max - min)
    } else {
        d / (max + min)
    };
    let h = if max == rf {
        (gf - bf) / d + if gf < bf { 6.0 } else { 0.0 }
    } else if max == gf {
        (bf - rf) / d + 2.0
    } else {
        (rf - gf) / d + 4.0
    };
    (h * 60.0, s * 100.0, l * 100.0)
}

#[tauri::command]
pub fn color_parse(input: String) -> ColorInfo {
    let s = input.trim();
    if s.is_empty() {
        return err("请输入颜色值，如 #5b6cff、rgb(91,108,255)、hsl(230, 100%, 68%)");
    }
    let parsed = if s.starts_with("rgb") {
        parse_rgb(s)
    } else if s.starts_with("hsl") {
        parse_hsl(s)
    } else {
        parse_hex(s)
    };
    let Some((r, g, b, a)) = parsed else {
        return err("看不懂这个颜色值");
    };
    let (h, sat, l) = rgb_to_hsl(r, g, b);
    ColorInfo {
        hex: format!("#{r:02x}{g:02x}{b:02x}"),
        hex8: format!("#{r:02x}{g:02x}{b:02x}{a:02x}"),
        rgb: if a == 255 {
            format!("rgb({r}, {g}, {b})")
        } else {
            format!("rgba({r}, {g}, {b}, {:.2})", a as f64 / 255.0)
        },
        hsl: format!("hsl({:.0}, {:.0}%, {:.0}%)", h, sat, l),
        r,
        g,
        b,
        a,
        error: None,
    }
}

/// WCAG 对比度：给两个颜色算对比度，顺带判断是否达到 AA / AAA
#[tauri::command]
pub fn contrast_ratio(fg: String, bg: String) -> Result<f64, String> {
    let f = parse_hex(&fg).or_else(|| parse_rgb(&fg)).ok_or("前景色无法解析")?;
    let b = parse_hex(&bg).or_else(|| parse_rgb(&bg)).ok_or("背景色无法解析")?;

    fn lum(c: (u8, u8, u8, u8)) -> f64 {
        fn ch(v: u8) -> f64 {
            let s = v as f64 / 255.0;
            if s <= 0.03928 {
                s / 12.92
            } else {
                ((s + 0.055) / 1.055).powf(2.4)
            }
        }
        0.2126 * ch(c.0) + 0.7152 * ch(c.1) + 0.0722 * ch(c.2)
    }

    let l1 = lum(f);
    let l2 = lum(b);
    let (hi, lo) = if l1 > l2 { (l1, l2) } else { (l2, l1) };
    Ok((hi + 0.05) / (lo + 0.05))
}
