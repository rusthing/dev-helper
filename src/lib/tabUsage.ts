import { useCallback, useMemo, useState } from "react";
import type { TabItem } from "../components/Tabs";

const NS = "dev-helper.tab-usage.v1.";

type Counts = Record<string, number>;

function load(key: string): Counts {
  try {
    const raw = window.localStorage.getItem(NS + key);
    if (!raw) return {};
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Counts = {};
    for (const [id, n] of Object.entries(v as Record<string, unknown>)) {
      if (typeof n === "number" && Number.isFinite(n) && n > 0) out[id] = n;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * 按点击频次排 Tab：次数多的在前，同次数保持默认顺序。
 *
 * 频次存在 localStorage，刷新后仍然生效；读不到或数据损坏时退回默认顺序。
 * 排序只影响展示顺序，当前选中项由调用方按 id 保存，不会因为重排而跳走。
 */
export function useTabUsage<T extends string>(key: string, defaults: TabItem<T>[]) {
  const [counts, setCounts] = useState<Counts>(() => load(key));

  const items = useMemo(
    () =>
      defaults
        .map((item, index) => ({ item, index }))
        .sort(
          (a, b) =>
            (counts[b.item.id] ?? 0) - (counts[a.item.id] ?? 0) || a.index - b.index,
        )
        .map(({ item }) => item),
    [defaults, counts],
  );

  const record = useCallback(
    (id: T) => {
      setCounts((prev) => {
        const next = { ...prev, [id]: (prev[id] ?? 0) + 1 };
        try {
          window.localStorage.setItem(NS + key, JSON.stringify(next));
        } catch {
          /* 存不进去就只影响本次排序 */
        }
        return next;
      });
    },
    [key],
  );

  return { items, record };
}
