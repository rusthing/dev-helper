use digest::Digest;
use hmac::{Hmac, KeyInit, Mac};
use md5::Md5;
use sha1::Sha1;
use sha2::{Sha224, Sha256, Sha384, Sha512};
use sm3::Sm3;
use serde::Serialize;

#[derive(Serialize)]
pub struct HashResult {
    pub algo: String,
    pub output: String,
}

fn hex_encode(bytes: &[u8], upper: bool) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{:02x}", b));
    }
    if upper {
        s.to_uppercase()
    } else {
        s
    }
}

fn digest<D: Digest>(data: &[u8]) -> Vec<u8> {
    let mut h = D::new();
    h.update(data);
    h.finalize().to_vec()
}

/// FNV-1a 32 位：offset basis 0x811C9DC5，质数 0x01000193
fn fnv1a_32(data: &[u8]) -> u32 {
    let mut h: u32 = 0x811c_9dc5;
    for b in data {
        h ^= u32::from(*b);
        h = h.wrapping_mul(0x0100_0193);
    }
    h
}

/// FNV-1a 64 位：offset basis 0xCBF29CE484222325，质数 0x100000001B3
fn fnv1a_64(data: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in data {
        h ^= u64::from(*b);
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    h
}

fn hash_with(algo: &str, data: &[u8]) -> Vec<u8> {
    match algo {
        "md5" => digest::<Md5>(data),
        "sha1" => digest::<Sha1>(data),
        "sha224" => digest::<Sha224>(data),
        "sha256" => digest::<Sha256>(data),
        "sha384" => digest::<Sha384>(data),
        "sha512" => digest::<Sha512>(data),
        "sm3" => digest::<Sm3>(data),
        // FNV 是整数结果，转大端字节保证定长输出（8 / 16 位十六进制）
        "fnv1a32" => fnv1a_32(data).to_be_bytes().to_vec(),
        "fnv1a64" => fnv1a_64(data).to_be_bytes().to_vec(),
        _ => Vec::new(),
    }
}

#[tauri::command]
pub fn hash_text(text: String, algos: Vec<String>, upper: bool) -> Vec<HashResult> {
    algos
        .iter()
        .map(|a| {
            let out = hash_with(a, text.as_bytes());
            HashResult { algo: a.clone(), output: hex_encode(&out, upper) }
        })
        .collect()
}

type HmacSha1 = Hmac<Sha1>;
type HmacSha256 = Hmac<Sha256>;
type HmacSha512 = Hmac<Sha512>;

fn hmac_digest<H: Mac + KeyInit>(data: &[u8], key: &[u8]) -> Vec<u8> {
    let mut m = H::new_from_slice(key).unwrap_or_else(|_| H::new_from_slice(&[]).unwrap());
    m.update(data);
    m.finalize().into_bytes().to_vec()
}

#[tauri::command]
pub fn hmac_text(text: String, key: String, algo: String, upper: bool) -> String {
    let data = text.as_bytes();
    let k = key.as_bytes();
    let out = match algo.as_str() {
        "sha1" => hmac_digest::<HmacSha1>(data, k),
        "sha256" => hmac_digest::<HmacSha256>(data, k),
        "sha512" => hmac_digest::<HmacSha512>(data, k),
        _ => Vec::new(),
    };
    hex_encode(&out, upper)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn md5_of_abc() {
        let r = hash_text("abc".into(), vec!["md5".into()], false);
        assert_eq!(r[0].output, "900150983cd24fb0d6963f7d28e17f72");
    }

    #[test]
    fn sha256_of_abc() {
        let r = hash_text("abc".into(), vec!["sha256".into()], false);
        assert_eq!(
            r[0].output,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn hmac_sha256_matches_rfc4231_case2() {
        // RFC 4231 Test Case 2: key = "Jefe", data = "what do ya want for nothing?"
        let out = hmac_text(
            "what do ya want for nothing?".into(),
            "Jefe".into(),
            "sha256".into(),
            false,
        );
        assert_eq!(
            out,
            "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
        );
    }

    #[test]
    fn sm3_matches_gm_t_standard_vectors() {
        // GM/T 0004-2012 附录 A.1：输入 "abc"
        let r = hash_text("abc".into(), vec!["sm3".into()], false);
        assert_eq!(
            r[0].output,
            "66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0"
        );

        // 附录 A.2：输入 "abcd" 重复 16 次（64 字节）
        let r = hash_text("abcd".repeat(16), vec!["sm3".into()], false);
        assert_eq!(
            r[0].output,
            "debe9ff92275b8a138604889c18e5a4d6fdb70e5387e5765293dcba39c0c5732"
        );
    }

    #[test]
    fn fnv1a_matches_reference_vectors() {
        // 参考实现（Landon Curt Noll）标准测试向量
        let cases = [
            ("", "811c9dc5", "cbf29ce484222325"),
            ("a", "e40c292c", "af63dc4c8601ec8c"),
            ("foobar", "bf9cf968", "85944171f73967e8"),
        ];
        for (input, want32, want64) in cases {
            let r = hash_text(input.into(), vec!["fnv1a32".into(), "fnv1a64".into()], false);
            assert_eq!(r[0].output, want32, "FNV-1a 32 输入 {input:?}");
            assert_eq!(r[1].output, want64, "FNV-1a 64 输入 {input:?}");
        }
    }

    #[test]
    fn fnv1a_output_length_is_fixed() {
        // 即使是前导零也要补齐成 8 / 16 位十六进制
        let r = hash_text("a".into(), vec!["fnv1a32".into()], false);
        assert_eq!(r[0].output.len(), 8);
        let r = hash_text("a".into(), vec!["fnv1a64".into()], true);
        assert_eq!(r[0].output.len(), 16);
        assert!(r[0].output.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()));
    }
}
