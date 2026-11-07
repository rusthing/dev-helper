# Dev Helper

跨平台、全离线的开发者工具箱。14 个常用小工具，数据不出本机。

界面用 **Tauri 2 + React + TypeScript**，业务逻辑用 **Rust**。
布局走浏览器原生的 CSS Grid / Flexbox —— 对齐是**声明**出来的，不是逐像素算出来的。

---

## 为什么不用 egui

上一版是 egui 0.37 的 immediate mode 实现。它没有布局引擎，每一行的列宽、行高、
垂直居中都要手算矩形坐标；加一个页面就重算一遍，永远有「差几像素」的错位。

换成 Web 渲染层后：

```css
/* 一列 92px、一列自适应、操作列贴右 —— 一次声明，所有行永远对齐 */
.kv-grid {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr) auto;
  column-gap: 16px;
}
```

改字号、改窗口宽度、内容换行，布局自动重排，不会漂。

---

## 工具

| 分组 | 工具 | 说明 |
|---|---|---|
| 转换 | 时间戳转换 | 秒 / 毫秒 / 微秒 / 纳秒与日期互转，一次看到 10 个时区（转换页第一个 tab） |
| 转换 | 颜色转换 | HEX / HEX8 / RGB / HSL 互转，带 WCAG 对比度 |
| 编解码 | Base64 | 文本编解码，支持 URL 安全字符与去 padding |
| 编解码 | URL 编解码 | 百分号编解码 + URL 拆解 + 查询参数 |
| 编解码 | JWT 解析 | 解开 header / payload，显示算法与签名 |
| 生成 | 哈希计算 | MD5 / SHA-1 / SHA-256 / SHA-512，附 HMAC |
| 生成 | 密码生成 | 可配字符集与长度，剔除易混字符 |
| 生成 | UUID 生成 | 批量 v4 / v7，可去连字符、加花括号 |
| 生成 | 二维码 | 文本转二维码，可保存 PNG |
| 文本 | JSON 格式化 | 美化 / 压缩 / 键排序，展开内嵌 JSON，高亮 `{{x}}` / `${x}` 占位符；语法错误定位到行列并高亮出错字符 |
| 文本 | SQL 格式化 | 关键字大小写与缩进可调 |
| 文本 | 正则测试 | 实时高亮、捕获组、匹配计数 |
| 文本 | 文本对比 | 逐行 diff，带增删统计 |
| 文本 | 文本处理 | 大小写、命名风格、行去重 / 排序 / 倒序、统计 |

---

## 开发

```bash
pnpm install
pnpm tauri dev           # 桌面应用（Rust + WebView）
```

只调界面时可以只跑前端：

```bash
pnpm dev                 # http://localhost:1420
```

浏览器里 `invoke` 走 `src/lib/mock.ts` 的假数据，能完整看到布局。
生产构建时 `import.meta.env.DEV` 为 false，mock 会被 tree-shake 掉。

## 构建

```bash
pnpm tauri build -- --bundles app
# 产物：src-tauri/target/release/bundle/macos/Dev Helper.app（约 16 MB）
```

> 不加 `--bundles app` 时还会尝试打 `.dmg`。部分 macOS 环境下 `bundle_dmg.sh`
> 会因为 `grep` 正则报错（`/dev/disk3s` 里的括号），`.app` 本身不受影响。

## 目录

```
src/
  components/    Card / CopyButton / Segmented / Sidebar / Header / StatusBar / Icon
  lib/           tools.ts（工具元数据）api.ts（IPC 封装）mock.ts（浏览器假后端）theme.ts store.ts
  pages/         顶层 10 个页面（格式化 / 转换 / 解析 3 个聚合页 + 哈希等 7 个独立页；颜色 / URL / Cron / JWT / JSON / UA 等为聚合页内嵌面板，时间戳是转换页首个 tab）
  styles/        theme.css（亮暗变量）app.css（布局与组件）
  assets/        logo-mark.svg（侧边栏品牌图标：机器人本体，无底块）
src-tauri/
  src/lib.rs     注册 commands
  src/tools/     各工具的 Rust 实现（无 UI 依赖）
  icons/         应用图标
```

## 设计约定

- **颜色 / 字号 / 圆角 / 阴影**全部走 `theme.css` 的 CSS 变量，亮暗两套只换变量。
- **对齐**只用 CSS Grid 的列定义表达；不在组件里写死 margin 去凑位置。
- **业务逻辑只在 Rust**：前端不做算法，只负责渲染与交互。
- **图标只有一处源**：`icon-designs/robot/build.mjs` 的 `PALETTES` 定义配色，
  `node icon-designs/robot/build.mjs` 出 SVG，`node icon-designs/render.mjs icon-designs/robot` 出 PNG；
  `src-tauri/icons/` 用同一套配色，侧边栏的 `src/assets/logo-mark.svg` 是「去掉蓝色底块」的机器人本体变体。
  换配色别改这些产物，改 `PALETTES`。
- **搜索**：`tools.ts` 的 `matchTool` 统一判定，名称 / 描述 / 分组 / 拼音首字母都命中且不区分大小写；
  新增工具记得补 `py` 字段（中文名的首字母，如 `sjczz`）。
