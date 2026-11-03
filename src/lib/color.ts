/**
 * 颜色的小工具。
 *
 * 只做一件事：算出某个底色上该用白字还是深字。
 * 常见颜色和收藏颜色都是「背景就是颜色本身」的方块，文字得跟着底色走，
 * 否则黄色底上写白字基本看不见。
 */

type Rgb = [number, number, number];

function expand(hex: string): Rgb | null {
  const h = hex.trim().replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** WCAG 相对亮度 */
function luminance([r, g, b]: Rgb): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/**
 * 底色偏亮就该用深色字。
 *
 * 阈值取 0.24 而不是 WCAG 换色用的 0.179：蓝、洋红、珊瑚这几个正好卡在
 * 0.18~0.23，按纯对比度算会被判成「用深字」，看着反而别扭；
 * 抬到 0.24 之后，橙 / 黄 / 绿 / 青 / 浅灰用深字，其余用白字，符合直觉。
 */
export function needsDarkText(hex: string): boolean {
  const rgb = expand(hex);
  return rgb ? luminance(rgb) > 0.24 : false;
}
