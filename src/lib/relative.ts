/**
 * 相对时间文案。
 *
 * 与后端 `tools/timestamp.rs::relative` 同一套规则（改一处要同步改另一处）：
 * 逐级降精度、不四舍五入，8.9 小时显示 8 小时。
 *
 * 放在前端是为了能每秒刷新——输入「现在」之后数字要跟着走，
 * 靠重新调一次后端来刷新既浪费也没必要，格式化本来就是展示层的事。
 */
export function relativeText(ms: number, now: number): string {
  const d = now - ms;
  const a = Math.abs(d);
  if (a < 1000) return "刚刚";

  // [上限, 除数, 单位]
  const steps: Array<[number, number, string]> = [
    [60_000, 1_000, "秒"],
    [3_600_000, 60_000, "分钟"],
    [86_400_000, 3_600_000, "小时"],
    [2_592_000_000, 86_400_000, "天"],
    [31_536_000_000, 2_592_000_000, "个月"],
    [Infinity, 31_536_000_000, "年"],
  ];
  const hit = steps.find(([limit]) => a < limit) ?? steps[steps.length - 1];
  return `${Math.floor(a / hit[1])} ${hit[2]}${d < 0 ? "后" : "前"}`;
}
