import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

const NS = "dev-helper.pref.";

/**
 * 记住「设置类」状态，下次打开页面直接还原。
 *
 * 只用于选项：长度、数量、缩进、大小写、编码模式这些。
 * **不要**用来存输入内容——时间戳必须每次是当前时间，粘贴框也应该是空的。
 *
 * 存不进 localStorage（隐私模式、配额满）就静默退回内存态，功能不受影响。
 */
export function usePref<T>(
  key: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const fallback = typeof initial === "function" ? (initial as () => T)() : initial;
    try {
      const raw = window.localStorage.getItem(NS + key);
      if (raw == null) return fallback;
      const parsed = JSON.parse(raw) as T;
      // 类型对不上（改过类型定义、手改过 localStorage）就当没存过。
      // typeof 对 null 和数组都返回 "object"，所以数组还得单独看一眼。
      if (typeof parsed !== typeof fallback) return fallback;
      if (Array.isArray(fallback) !== Array.isArray(parsed)) return fallback;
      if (parsed === null) return fallback;
      return parsed;
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(NS + key, JSON.stringify(value));
    } catch {
      /* 写不进去就算了，不影响本次使用 */
    }
  }, [key, value]);

  return [value, setValue];
}
