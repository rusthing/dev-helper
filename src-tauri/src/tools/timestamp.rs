use std::str::FromStr;

use chrono::{Datelike, Local, NaiveDateTime, Offset, TimeZone, Utc};
use chrono_tz::Tz;
use serde::Serialize;

#[derive(Serialize)]
pub struct TsUnit {
    pub label: String,
    pub value: String,
}

#[derive(Serialize)]
pub struct TsRep {
    pub label: String,
    pub value: String,
}

#[derive(Serialize)]
pub struct TsZone {
    pub name: String,
    pub id: String,
    pub offset: String,
    pub datetime: String,
    pub weekday: String,
}

#[derive(Serialize)]
pub struct TsResult {
    pub millis: Option<i64>,
    pub units: Vec<TsUnit>,
    pub reps: Vec<TsRep>,
    pub zones: Vec<TsZone>,
}

/// (展示名, IANA / Local / UTC)
const ZONES: &[(&str, &str)] = &[
    ("本地", "Local"),
    ("UTC", "UTC"),
    ("上海", "Asia/Shanghai"),
    ("东京", "Asia/Tokyo"),
    ("新加坡", "Asia/Singapore"),
    ("伦敦", "Europe/London"),
    ("柏林", "Europe/Berlin"),
    ("纽约", "America/New_York"),
    ("洛杉矶", "America/Los_Angeles"),
    ("悉尼", "Australia/Sydney"),
];

const WEEKDAYS: &[&str] = &["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

fn parse_millis(input: &str) -> Option<i64> {
    let s = input.trim();
    if s.is_empty() {
        return None;
    }
    // 纯数字：按长度推断单位
    if s.bytes().all(|b| b.is_ascii_digit()) {
        let n: i64 = s.parse().ok()?;
        return Some(match s.len() {
            10 | 9 => n * 1_000,       // 秒
            13 | 12 => n,             // 毫秒
            16 | 15 => n / 1_000,     // 微秒
            19 | 18 => n / 1_000_000, // 纳秒
            _ => return None,
        });
    }
    // RFC 3339
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        return Some(dt.timestamp_millis());
    }
    // 常见日期格式
    for fmt in [
        "%Y-%m-%d %H:%M:%S%.3f",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S%.3f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y/%m/%d %H:%M:%S",
    ] {
        if let Ok(ndt) = NaiveDateTime::parse_from_str(s, fmt) {
            if let Some(local) = Local.from_local_datetime(&ndt).single() {
                return Some(local.timestamp_millis());
            }
        }
    }
    None
}

fn fmt_millis(millis: i64, tz: Tz) -> String {
    match Utc.timestamp_millis_opt(millis).single() {
        Some(dt) => dt.with_timezone(&tz).format("%Y-%m-%d %H:%M:%S%.3f").to_string(),
        None => String::new(),
    }
}

fn local_fmt(millis: i64) -> String {
    match Utc.timestamp_millis_opt(millis).single() {
        Some(dt) => dt
            .with_timezone(&Local)
            .format("%Y-%m-%d %H:%M:%S%.3f")
            .to_string(),
        None => String::new(),
    }
}

fn offset_of(tz: Tz, millis: i64) -> String {
    match Utc.timestamp_millis_opt(millis).single() {
        Some(dt) => {
            let off = tz.offset_from_utc_datetime(&dt.naive_utc()).fix();
            let s = off.local_minus_utc();
            let sign = if s >= 0 { '+' } else { '-' };
            let a = s.abs();
            format!("{}{:02}:{:02}", sign, a / 3600, (a % 3600) / 60)
        }
        None => String::new(),
    }
}

fn local_offset(millis: i64) -> String {
    match Utc.timestamp_millis_opt(millis).single() {
        Some(dt) => {
            let off = Local.offset_from_utc_datetime(&dt.naive_utc());
            let s = off.local_minus_utc();
            let sign = if s >= 0 { '+' } else { '-' };
            let a = s.abs();
            format!("{}{:02}:{:02}", sign, a / 3600, (a % 3600) / 60)
        }
        None => String::new(),
    }
}

fn weekday_of(tz: Tz, millis: i64) -> String {
    match Utc.timestamp_millis_opt(millis).single() {
        Some(dt) => WEEKDAYS[dt.with_timezone(&tz).weekday().num_days_from_monday() as usize]
            .to_string(),
        None => String::new(),
    }
}

fn weekday_local(millis: i64) -> String {
    match Utc.timestamp_millis_opt(millis).single() {
        Some(dt) => WEEKDAYS[dt.with_timezone(&Local).weekday().num_days_from_monday() as usize]
            .to_string(),
        None => String::new(),
    }
}

fn iso_of(millis: i64, tz: Tz) -> String {
    match Utc.timestamp_millis_opt(millis).single() {
        Some(dt) => dt
            .with_timezone(&tz)
            .format("%Y-%m-%dT%H:%M:%S%.3f%:z")
            .to_string(),
        None => String::new(),
    }
}

/// 相对时间。`now` 单独传进来而不是内部取，方便用固定时刻写断言
fn relative(ms: i64, now: i64) -> String {
    let d = now - ms;
    let a = d.abs();
    if a < 1_000 {
        return "刚刚".into();
    }
    // 逐级降精度，不做四舍五入：8.9 小时显示 8 小时，比显示 9 小时更不容易误解
    let (v, unit) = if a < 60_000 {
        (a / 1_000, "秒")
    } else if a < 3_600_000 {
        (a / 60_000, "分钟")
    } else if a < 86_400_000 {
        (a / 3_600_000, "小时")
    } else if a < 2_592_000_000 {
        (a / 86_400_000, "天")
    } else if a < 31_536_000_000 {
        (a / 2_592_000_000, "个月")
    } else {
        (a / 31_536_000_000, "年")
    };
    format!("{v} {unit}{}", if d < 0 { "后" } else { "前" })
}

#[tauri::command]
pub fn convert_timestamp(input: String) -> TsResult {
    let millis = parse_millis(&input);
    let (units, reps, zones) = match millis {
        Some(ms) => {
            let units = vec![
                TsUnit { label: "秒 (s)".into(), value: (ms / 1000).to_string() },
                TsUnit { label: "毫秒 (ms)".into(), value: ms.to_string() },
            ];
            let reps = vec![
                TsRep { label: "UTC".into(), value: fmt_millis(ms, Tz::UTC) },
                TsRep { label: "本地时间".into(), value: local_fmt(ms) },
                TsRep { label: "ISO 8601".into(), value: iso_of(ms, Tz::UTC) },
                TsRep { label: "RFC 3339".into(), value: iso_of(ms, Tz::UTC) },
                TsRep { label: "相对现在".into(), value: relative(ms, Utc::now().timestamp_millis()) },
            ];
            let zones = ZONES
                .iter()
                .map(|(name, id)| {
                    let is_local = *id == "Local";
                    let tz = if is_local { None } else { Tz::from_str(id).ok() };
                    let datetime = if is_local {
                        local_fmt(ms)
                    } else {
                        tz.map(|t| fmt_millis(ms, t)).unwrap_or_default()
                    };
                    let offset = if is_local {
                        local_offset(ms)
                    } else {
                        tz.map(|t| offset_of(t, ms)).unwrap_or_default()
                    };
                    let weekday = if is_local {
                        weekday_local(ms)
                    } else {
                        tz.map(|t| weekday_of(t, ms)).unwrap_or_default()
                    };
                    TsZone {
                        name: name.to_string(),
                        id: id.to_string(),
                        offset,
                        datetime,
                        weekday,
                    }
                })
                .collect();
            (units, reps, zones)
        }
        None => (vec![], vec![], vec![]),
    };
    TsResult { millis, units, reps, zones }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seconds_are_scaled_to_millis() {
        assert_eq!(parse_millis("1793605102"), Some(1_793_605_102_000));
    }

    #[test]
    fn millis_pass_through() {
        assert_eq!(parse_millis("1793605102000"), Some(1_793_605_102_000));
    }

    #[test]
    fn iso_string_is_parsed() {
        assert!(parse_millis("2026-11-02T07:38:22Z").is_some());
    }

    #[test]
    fn relative_reads_naturally() {
        let now = 1_800_000_000_000i64;
        assert_eq!(relative(now, now), "刚刚");
        assert_eq!(relative(now - 1_000, now), "1 秒前");
        assert_eq!(relative(now - 90_000, now), "1 分钟前");
        assert_eq!(relative(now - 54_000_000, now), "15 小时前");
        assert_eq!(relative(now + 7_200_000, now), "2 小时后");
        assert_eq!(relative(now - 3 * 86_400_000, now), "3 天前");
    }

    #[test]
    fn zones_and_units_are_filled() {
        let r = convert_timestamp("1793605102".into());
        assert_eq!(r.units.len(), 2);
        assert_eq!(r.units[0].label, "秒 (s)");
        assert_eq!(r.units[1].label, "毫秒 (ms)");
        assert_eq!(r.zones.len(), ZONES.len());
        assert_eq!(r.reps.len(), 5);
    }
}
