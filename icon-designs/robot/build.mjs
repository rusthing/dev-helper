// 从 template.svg.tmpl 生成几套配色。改颜色只要改这里的表，再跑一次。
// 用法: node icon-designs/robot/build.mjs
//
// 配色取自程序员日常用的编辑器主题：
//   bg   = 编辑器背景      face = 正文前景色（近白/暖白）
//   lamp = 主题里的标志色（类型/关键字/字符串那种高饱和色）
//   blush= 另一个语法色（字符串/数字），压低不抢眼
//   ink  = 回到背景色，让五官像从头上「镂空」出来
//   glow = 头部背后的光晕，用来把整体「点亮」，不要光晕就设 glowA: "0"
import fs from "node:fs";
import path from "node:path";

const dir = path.dirname(new URL(import.meta.url).pathname);
const tmpl = fs.readFileSync(path.join(dir, "template.svg.tmpl"), "utf8");

const PALETTES = {
  // VS Code 默认深色（Dark+）：#1E1E1E 底，青 #4EC9B0 是类型色，橙 #CE9178 是字符串色
  "v1-vscode": {
    bg1: "#1E1E1E", bg2: "#141414",
    face1: "#F5F5F5", face2: "#D4D4D4",
    ear: "#4A4A4A", stem: "#E8E8E8",
    lamp: "#4EC9B0", ink: "#1A1A1A", blush: "#CE9178", shadow: "#000000",
    glow: "#4EC9B0", glowA: "0",
  },
  // Atom One Dark：炭灰 #282C34，蓝 #61AFEF 是函数色，红 #E06C75 是变量色
  "v2-onedark": {
    bg1: "#2C313A", bg2: "#1B1F27",
    face1: "#FFFFFF", face2: "#C8CEDB",
    ear: "#444B59", stem: "#E6E9EF",
    lamp: "#61AFEF", ink: "#21252B", blush: "#E06C75", shadow: "#000000",
    glow: "#61AFEF", glowA: "0",
  },
  // Monokai：暖灰绿 #272822，粉 #F92672 是关键字色，橙 #FD971F 是数字色
  "v3-monokai": {
    bg1: "#2B2C24", bg2: "#1B1C16",
    face1: "#FAFAF2", face2: "#D8D8C8",
    ear: "#4B4A3E", stem: "#F8F8F2",
    lamp: "#F92672", ink: "#272822", blush: "#FD971F", shadow: "#000000",
    glow: "#F92672", glowA: "0",
  },
  // Dracula：紫灰 #282A36，粉 #FF79C6 是关键字色，紫 #BD93F9 是函数色
  "v4-dracula": {
    bg1: "#2C2E3B", bg2: "#191A21",
    face1: "#F8F8F2", face2: "#CBCDD9",
    ear: "#44475A", stem: "#F8F8F2",
    lamp: "#FF79C6", ink: "#21222C", blush: "#BD93F9", shadow: "#000000",
    glow: "#FF79C6", glowA: "0",
  },
  // Nord：冷灰蓝 #2E3440，霜蓝 #88C0D0，红 #BF616A
  "v5-nord": {
    bg1: "#2E3440", bg2: "#21262F",
    face1: "#ECEFF4", face2: "#C4CDDB",
    ear: "#4C566A", stem: "#ECEFF4",
    lamp: "#88C0D0", ink: "#2E3440", blush: "#BF616A", shadow: "#000000",
    glow: "#88C0D0", glowA: "0",
  },
  // Solarized Dark：深青 #002B36，黄 #B58900，橙 #CB4B16；头用它的浅底 #FDF6E3
  "v6-solarized": {
    bg1: "#00323D", bg2: "#001C24",
    face1: "#FDF6E3", face2: "#DDD6C1",
    ear: "#0A4A57", stem: "#EEE8D5",
    lamp: "#B58900", ink: "#002B36", blush: "#CB4B16", shadow: "#000000",
    glow: "#B58900", glowA: "0",
  },
  // Gruvbox：深褐灰 #282828，橙 #FE8019，红 #FB4934，头是牛皮纸色 #EBDBB2
  "v7-gruvbox": {
    bg1: "#2B2B2B", bg2: "#1D1D1D",
    face1: "#EBDBB2", face2: "#D5C69B",
    ear: "#3C3836", stem: "#EBDBB2",
    lamp: "#FE8019", ink: "#282828", blush: "#FB4934", shadow: "#000000",
    glow: "#FE8019", glowA: "0",
  },
  // Tokyo Night：深夜蓝黑 #1A1B26，蓝 #7AA2F7，粉 #F7768E
  "v8-tokyonight": {
    bg1: "#1E2030", bg2: "#101018",
    face1: "#C8D3F5", face2: "#A9B1D6",
    ear: "#2A2E42", stem: "#C8D3F5",
    lamp: "#7AA2F7", ink: "#1A1B26", blush: "#F7768E", shadow: "#000000",
    glow: "#7AA2F7", glowA: "0",
  },

  // ---- 在 v1 的基础上提亮 ----
  // x1 提亮灰：底色抬到 VS Code 标题栏/侧边栏那一档灰，再补一点青辉光
  "x1-lift": {
    bg1: "#434343", bg2: "#262626",
    face1: "#FFFFFF", face2: "#DCDCDC",
    ear: "#5E5E5E", stem: "#F0F0F0",
    lamp: "#4EC9B0", ink: "#1F1F1F", blush: "#CE9178", shadow: "#000000",
    glow: "#4EC9B0", glowA: "0.16",
  },
  // x2 品牌蓝：VS Code 的招牌蓝 #007ACC 做渐变，头近白，顶灯用类型青 #4EC9B0
  "x2-blue": {
    bg1: "#1477CE", bg2: "#0A4B87",
    face1: "#FFFFFF", face2: "#DCE7F2",
    ear: "#5E9BD0", stem: "#EAF2FA",
    lamp: "#4EC9B0", ink: "#0A3A66", blush: "#CE9178", shadow: "#08243D",
    glow: "#7FC4FF", glowA: "0.22",
  },
  // x3 青绿：把类型色 #4EC9B0 压深当底，整体最「亮」但仍是冷色
  "x3-teal": {
    bg1: "#17A594", bg2: "#0B6B62",
    face1: "#FFFFFF", face2: "#DCF3EC",
    ear: "#6FC6B8", stem: "#EAF7F3",
    lamp: "#FFB020", ink: "#06403A", blush: "#FF9E7A", shadow: "#04322D",
    glow: "#8CF2DE", glowA: "0.20",
  },
  // x4 霓虹：底色不动，靠一团青光把画面「点亮」，像显示器在发亮
  "x4-glow": {
    bg1: "#262626", bg2: "#0E0E0E",
    face1: "#FFFFFF", face2: "#D9D9D9",
    ear: "#4A4A4A", stem: "#F0F0F0",
    lamp: "#4EC9B0", ink: "#161616", blush: "#CE9178", shadow: "#000000",
    glow: "#4EC9B0", glowA: "0.42",
  },
};

for (const [name, p] of Object.entries(PALETTES)) {
  let out = tmpl;
  for (const [k, v] of Object.entries(p)) {
    out = out.replaceAll(`{{${k}}}`, v);
  }
  const left = out.match(/\{\{\w+\}\}/g);
  if (left) throw new Error(`${name} 还有没替换的占位符: ${left.join(",")}`);
  fs.writeFileSync(path.join(dir, `${name}.svg`), out);
  console.log("生成", `${name}.svg`);
}
