use serde::Serialize;

#[derive(Serialize)]
pub struct CronInfo {
    /// 规整后的表达式（字段间统一单空格）
    pub normalized: String,
    /// 5 或 6
    pub fields: usize,
    /// 中文回显
    pub description: String,
}

struct Field {
    values: Vec<bool>,
    min: u32,
}

impl Field {
    fn all(&self) -> bool {
        self.values.iter().all(|v| *v)
    }

    fn values(&self) -> Vec<u32> {
        self.values
            .iter()
            .enumerate()
            .filter_map(|(i, on)| if *on { Some(self.min + i as u32) } else { None })
            .collect()
    }
}

const MONTH_NAMES: &[(&str, u32)] = &[
    ("JAN", 1),
    ("FEB", 2),
    ("MAR", 3),
    ("APR", 4),
    ("MAY", 5),
    ("JUN", 6),
    ("JUL", 7),
    ("AUG", 8),
    ("SEP", 9),
    ("OCT", 10),
    ("NOV", 11),
    ("DEC", 12),
];

const WEEK_NAMES: &[(&str, u32)] = &[
    ("SUN", 0),
    ("MON", 1),
    ("TUE", 2),
    ("WED", 3),
    ("THU", 4),
    ("FRI", 5),
    ("SAT", 6),
];

fn parse_value(raw: &str, names: &[(&str, u32)], label: &str) -> Result<u32, String> {
    let t = raw.trim();
    if t.is_empty() {
        return Err(format!("{label}字段有空值"));
    }
    if let Ok(n) = t.parse::<u32>() {
        return Ok(n);
    }
    let up = t.to_ascii_uppercase();
    names
        .iter()
        .find(|(name, _)| *name == up)
        .map(|(_, v)| *v)
        .ok_or_else(|| format!("{label}字段无法识别「{raw}」"))
}

/// 把一个字段解析成「哪些值被选中」的集合。
///
/// 支持 `*`、单值、`a-b` 范围、`*/n` 与 `a-n/s` 步长，以及逗号列表。
/// 月 / 周支持英文缩写；周字段允许 7 作为周日别名。
fn parse_field(
    token: &str,
    min: u32,
    max: u32,
    label: &str,
    names: &[(&str, u32)],
    allow_seven: bool,
) -> Result<Field, String> {
    let mut values = vec![false; (max - min + 1) as usize];
    let limit = if allow_seven { 7 } else { max };
    if token.trim().is_empty() {
        return Err(format!("{label}字段为空"));
    }

    for item in token.split(',') {
        if item.trim().is_empty() {
            return Err(format!("{label}字段的列表里有空项"));
        }
        let mut slash = item.split('/');
        let base = slash.next().unwrap_or("");
        let step_raw = slash.next();
        if slash.next().is_some() {
            return Err(format!("{label}字段里出现了多个 /"));
        }
        let step = match step_raw {
            Some(s) => {
                let n: u32 = s
                    .parse()
                    .map_err(|_| format!("{label}字段的步长「{s}」不是正整数"))?;
                if n == 0 {
                    return Err(format!("{label}字段的步长必须大于 0"));
                }
                Some(n)
            }
            None => None,
        };

        let (start, end) = if base == "*" {
            (min, max)
        } else if let Some((a, b)) = base.split_once('-') {
            let start = parse_value(a, names, label)?;
            let end = parse_value(b, names, label)?;
            if start > end {
                return Err(format!("{label}字段的范围 {start}-{end} 起点大于终点"));
            }
            (start, end)
        } else {
            let v = parse_value(base, names, label)?;
            if step.is_some() {
                (v, limit)
            } else {
                (v, v)
            }
        };

        if start > limit || end > limit {
            return Err(format!(
                "{label}字段的值 {start}-{end} 超出范围 {min}-{limit}"
            ));
        }
        if start < min || end < min {
            return Err(format!(
                "{label}字段的值 {start}-{end} 超出范围 {min}-{limit}"
            ));
        }

        let step = step.unwrap_or(1);
        let mut v = start;
        while v <= end {
            let normalized = if allow_seven && v == 7 { 0 } else { v };
            if normalized < min || normalized > max {
                return Err(format!("{label}字段的值 {v} 超出范围 {min}-{max}"));
            }
            values[(normalized - min) as usize] = true;
            v += step;
        }
    }

    Ok(Field { values, min })
}

fn uniform_step(vals: &[u32]) -> Option<u32> {
    if vals.len() < 2 {
        return None;
    }
    let d = vals[1] - vals[0];
    if d == 0 {
        return None;
    }
    if vals.windows(2).all(|w| w[1] - w[0] == d) {
        Some(d)
    } else {
        None
    }
}

fn join_values(vals: &[u32]) -> String {
    vals.iter()
        .map(|v| v.to_string())
        .collect::<Vec<_>>()
        .join("、")
}

fn weekday_name(v: u32) -> &'static str {
    match v {
        0 => "周日",
        1 => "周一",
        2 => "周二",
        3 => "周三",
        4 => "周四",
        5 => "周五",
        _ => "周六",
    }
}

fn weekday_phrase(vals: &[u32]) -> String {
    if vals.len() == 7 {
        return "每天".into();
    }
    let mut parts = Vec::new();
    let mut i = 0;
    while i < vals.len() {
        let mut j = i;
        while j + 1 < vals.len() && vals[j + 1] == vals[j] + 1 {
            j += 1;
        }
        if j - i + 1 >= 3 {
            parts.push(format!("{}至{}", weekday_name(vals[i]), weekday_name(vals[j])));
            i = j + 1;
        } else {
            parts.push(weekday_name(vals[i]).to_string());
            i += 1;
        }
    }
    format!("每{}", parts.join("、"))
}

fn date_phrase(month: &Field, dom: &Field, dow: &Field) -> String {
    let month_all = month.all();
    let dom_all = dom.all();
    let dow_all = dow.all();
    let months = join_values(&month.values());
    let doms = join_values(&dom.values());
    let weeks = weekday_phrase(&dow.values());

    match (month_all, dom_all, dow_all) {
        (true, true, true) => "每天".into(),
        (true, true, false) => weeks,
        (true, false, true) => format!("每月{doms}号"),
        (true, false, false) => format!("每月{doms}号或{weeks}"),
        (false, true, true) => format!("每年{months}月的每一天"),
        (false, true, false) => format!("每年{months}月的{weeks}"),
        (false, false, true) => format!("每年{months}月{doms}号"),
        (false, false, false) => format!("每年{months}月{doms}号或{weeks}"),
    }
}

fn append_seconds(base: String, sec: Option<&Field>) -> String {
    let Some(sec) = sec else {
        return base;
    };
    if sec.all() {
        return base;
    }
    let vals = sec.values();
    if vals.len() == 1 {
        format!("{base} 的第 {} 秒", vals[0])
    } else if let Some(step) = uniform_step(&vals) {
        format!("{base}（秒字段每 {step} 秒）")
    } else {
        format!("{base} 的第 {} 秒", join_values(&vals))
    }
}

fn time_phrase(sec: Option<&Field>, minute: &Field, hour: &Field) -> String {
    let hv = hour.values();
    let mv = minute.values();
    let sec_all = sec.map_or(true, |s| s.all());

    if hour.all() && minute.all() {
        if let Some(sec) = sec {
            if sec.all() {
                return "每秒".into();
            }
            if let Some(step) = uniform_step(&sec.values()) {
                return format!("每 {step} 秒");
            }
            return format!("每分钟的第 {} 秒", join_values(&sec.values()));
        }
        return "每分钟".into();
    }

    if hour.all() {
        if let Some(step) = uniform_step(&mv) {
            return append_seconds(format!("每 {step} 分钟"), sec);
        }
        if mv.len() == 1 && mv[0] == 0 {
            return append_seconds("每小时整点".into(), sec);
        }
        return append_seconds(format!("每小时的第 {} 分钟", join_values(&mv)), sec);
    }

    if minute.all() {
        let base = if let Some(step) = uniform_step(&hv) {
            format!("每 {step} 小时")
        } else {
            format!("在 {} 点内每分钟", join_values(&hv))
        };
        return append_seconds(base, sec);
    }

    if hv.len() == 1 && mv.len() == 1 {
        let mut base = format!("{:02}:{:02}", hv[0], mv[0]);
        if let Some(sec) = sec {
            if !sec_all && sec.values().len() == 1 {
                base = format!("{base}:{:02}", sec.values()[0]);
                return base;
            }
        }
        return append_seconds(base, sec);
    }
    if mv.len() == 1 && mv[0] == 0 && uniform_step(&hv).is_some() && sec_all {
        return format!("每 {} 小时整点", uniform_step(&hv).unwrap_or(1));
    }
    if hv.len() * mv.len() <= 12 {
        let mut times = Vec::new();
        for h in &hv {
            for m in &mv {
                times.push(format!("{h:02}:{m:02}"));
            }
        }
        return append_seconds(format!("在 {} 点", times.join("、")), sec);
    }
    append_seconds(
        format!("在 {} 点 {} 分", join_values(&hv), join_values(&mv)),
        sec,
    )
}

/// # Cron 表达式解析与中文回显
///
/// 5 段按 Linux crontab 规则：分 时 日 月 周；6 段在首位增加秒
/// （Quartz / Spring 扩展，标准 crontab 不识别秒字段）。
/// 周字段 0 / 7 都表示周日；月、周支持 JAN-DEC / SUN-SAT 缩写。
#[tauri::command]
pub fn cron_explain(expr: String) -> Result<CronInfo, String> {
    let parts: Vec<&str> = expr.split_whitespace().collect();
    if parts.is_empty() {
        return Err("请输入 Cron 表达式".into());
    }
    if parts.len() != 5 && parts.len() != 6 {
        return Err(format!(
            "Cron 表达式需要 5 段（分 时 日 月 周）或 6 段（秒 分 时 日 月 周），当前是 {} 段",
            parts.len()
        ));
    }
    let has_sec = parts.len() == 6;

    let mut idx = 0;
    let second = if has_sec {
        let f = parse_field(parts[idx], 0, 59, "秒", &[], false)?;
        idx += 1;
        Some(f)
    } else {
        None
    };
    let minute = parse_field(parts[idx], 0, 59, "分", &[], false)?;
    let hour = parse_field(parts[idx + 1], 0, 23, "时", &[], false)?;
    let dom = parse_field(parts[idx + 2], 1, 31, "日", &[], false)?;
    let month = parse_field(parts[idx + 3], 1, 12, "月", MONTH_NAMES, false)?;
    let dow = parse_field(parts[idx + 4], 0, 6, "周", WEEK_NAMES, true)?;

    let date = date_phrase(&month, &dom, &dow);
    let time = time_phrase(second.as_ref(), &minute, &hour);
    let description = if date == "每天" {
        if time.starts_with('每') || time == "每秒" || time == "每分钟" {
            format!("{time}执行一次")
        } else {
            format!("每天 {time} 执行")
        }
    } else {
        format!("{date} {time} 执行")
    };

    Ok(CronInfo {
        normalized: parts.join(" "),
        fields: parts.len(),
        description,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn explain(expr: &str) -> CronInfo {
        cron_explain(expr.into()).unwrap()
    }

    #[test]
    fn parses_every_minute() {
        let r = explain("* * * * *");
        assert_eq!(r.fields, 5);
        assert_eq!(r.description, "每分钟执行一次");
    }

    #[test]
    fn parses_step() {
        assert_eq!(explain("*/5 * * * *").description, "每 5 分钟执行一次");
    }

    #[test]
    fn parses_hourly() {
        assert_eq!(explain("0 * * * *").description, "每小时整点执行一次");
    }

    #[test]
    fn parses_daily_time() {
        assert_eq!(explain("0 9 * * *").description, "每天 09:00 执行");
    }

    #[test]
    fn parses_weekly_range() {
        assert_eq!(
            explain("0 9 * * 1-5").description,
            "每周一至周五 09:00 执行"
        );
    }

    #[test]
    fn parses_monthly() {
        assert_eq!(explain("0 0 1 * *").description, "每月1号 00:00 执行");
    }

    #[test]
    fn parses_six_fields() {
        assert_eq!(explain("*/30 * * * * *").description, "每 30 秒执行一次");
        assert_eq!(explain("0 0 9 * * *").description, "每天 09:00:00 执行");
    }

    #[test]
    fn accepts_names_and_sunday_seven() {
        let r = explain("0 9 * * MON-FRI");
        assert!(r.description.contains("周一至周五"));
        let r = explain("0 9 * * 7");
        assert!(r.description.contains("周日"));
    }

    #[test]
    fn rejects_bad_input() {
        assert!(cron_explain("* * *".into()).is_err());
        assert!(cron_explain("60 * * * *".into()).is_err());
        assert!(cron_explain("*/0 * * * *".into()).is_err());
        assert!(cron_explain("0 9 * * 8".into()).is_err());
        assert!(cron_explain("0 9 * * FOO".into()).is_err());
    }

    #[test]
    fn normalizes_spaces() {
        assert_eq!(explain(" 0   9  *  *  * ").normalized, "0 9 * * *");
    }
}
