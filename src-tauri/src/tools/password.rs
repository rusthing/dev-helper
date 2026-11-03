use rand::Rng;
use rand::seq::SliceRandom;

/// 完整字符集
const LOWER_FULL: &str = "abcdefghijklmnopqrstuvwxyz";
const UPPER_FULL: &str = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS_FULL: &str = "0123456789";

/// 剔除易混字符后的字符集：去掉 l / I / O / 0 / 1
const LOWER_SAFE: &str = "abcdefghijkmnopqrstuvwxyz";
const UPPER_SAFE: &str = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS_SAFE: &str = "23456789";

/// 符号集本身没有易混字符，两种情况共用
const SYMBOLS: &str = "!@#$%^&*-_=+?";

/// # 生成随机密码
///
/// ## 参数
/// - `length`：长度，实际取 4..=256
/// - `upper` / `lower` / `digits` / `symbols`：包含哪几类字符
/// - `count`：生成几条，实际取 1..=50
/// - `avoid_ambiguous`：是否剔除易混字符 0 O 1 l I（手抄、口述场景更友好；
///   关掉可用完整字符集，同样长度下熵略高）
///
/// ## 返回
/// 生成好的密码列表；一类字符都没选时报错。
#[tauri::command]
pub fn gen_password(
    length: usize,
    upper: bool,
    lower: bool,
    digits: bool,
    symbols: bool,
    count: usize,
    avoid_ambiguous: bool,
) -> Result<Vec<String>, String> {
    let (lo, up, di) = if avoid_ambiguous {
        (LOWER_SAFE, UPPER_SAFE, DIGITS_SAFE)
    } else {
        (LOWER_FULL, UPPER_FULL, DIGITS_FULL)
    };

    let mut pool = String::new();
    if lower {
        pool.push_str(lo);
    }
    if upper {
        pool.push_str(up);
    }
    if digits {
        pool.push_str(di);
    }
    if symbols {
        pool.push_str(SYMBOLS);
    }
    if pool.is_empty() {
        return Err("至少要选一类字符".into());
    }
    let len = length.clamp(4, 256);
    let n = count.clamp(1, 50);

    let mut rng = rand::rng();
    let chars: Vec<char> = pool.chars().collect();
    let mut out = Vec::with_capacity(n);
    for _ in 0..n {
        let mut s: Vec<char> = (0..len)
            .map(|_| chars[rng.random_range(0..chars.len())])
            .collect();
        // 打散，避免第一段总是同类字符
        s.shuffle(&mut rng);
        out.push(s.into_iter().collect());
    }
    Ok(out)
}

/// 粗略的强度评估：长度 + 字符种类
#[tauri::command]
pub fn password_strength(password: String) -> u8 {
    let mut kinds: i32 = 0;
    if password.chars().any(|c| c.is_ascii_lowercase()) {
        kinds += 1;
    }
    if password.chars().any(|c| c.is_ascii_uppercase()) {
        kinds += 1;
    }
    if password.chars().any(|c| c.is_ascii_digit()) {
        kinds += 1;
    }
    if password.chars().any(|c| !c.is_alphanumeric()) {
        kinds += 1;
    }
    let len = password.chars().count();
    let base: i32 = match len {
        0..=7 => 1,
        8..=11 => 2,
        12..=15 => 3,
        _ => 4,
    };
    (base + kinds.saturating_sub(1)).min(5) as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 容易看错的字符：零/O、一/小写 L/大写 I
    const CONFUSING: [char; 5] = ['0', 'O', '1', 'l', 'I'];

    #[test]
    fn safe_charset_never_contains_confusing_chars() {
        let list = gen_password(64, true, true, true, true, 50, true).unwrap();
        for p in &list {
            assert!(
                !p.contains(&CONFUSING[..]),
                "开启排除易混字符后仍出现了 {}: {p}",
                CONFUSING.iter().collect::<String>()
            );
        }
    }

    #[test]
    fn full_charset_does_contain_confusing_chars() {
        // 62 字符池里 5 个易混字符，50 条 x 64 位几乎必然出现
        let list = gen_password(64, true, true, true, false, 50, false).unwrap();
        assert!(
            list.iter().any(|p| p.contains(&CONFUSING[..])),
            "关闭排除后应该能用到完整字符集"
        );
    }

    #[test]
    fn empty_charset_is_rejected() {
        assert!(gen_password(16, false, false, false, false, 1, true).is_err());
    }

    #[test]
    fn length_is_clamped_to_4_256() {
        let long = gen_password(500, true, true, true, false, 1, true).unwrap();
        assert_eq!(long[0].chars().count(), 256);
        let short = gen_password(1, true, true, true, false, 1, true).unwrap();
        assert_eq!(short[0].chars().count(), 4);
    }
}
