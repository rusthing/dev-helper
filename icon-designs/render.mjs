// 把某个目录下的 *.svg 渲染成 1024 PNG（透明背景），再拼一张对比图。
// 用法:
//   node icon-designs/render.mjs                 # 渲染 icon-designs/ 下的 6 款
//   node icon-designs/render.mjs icon-designs/robot
// 依赖 playwright 缓存里的 chrome-headless-shell（CDP 驱动，截图带 alpha）。
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const HOME = process.env.HOME;
const BIN = `${HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-x64/chrome-headless-shell`;

const here = path.dirname(new URL(import.meta.url).pathname);
const dir = path.resolve(process.argv[2] || here);
const outDir = path.resolve(process.argv[3] || dir);
const PORT = 9340;

const proc = spawn(
  BIN,
  [
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    "--allow-file-access-from-files",
    `--remote-debugging-port=${PORT}`,
    "--force-device-scale-factor=1",
    "--window-size=1024,1024",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await r.json();
      const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* 还没起来 */
    }
    await sleep(150);
  }
  throw new Error("找不到调试目标");
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    };
    ws.onerror = reject;
    ws.onopen = () =>
      resolve({
        send(method, params = {}) {
          return new Promise((res) => {
            const i = ++id;
            pending.set(i, res);
            ws.send(JSON.stringify({ id: i, method, params }));
          });
        },
        close: () => ws.close(),
      });
  });
}

const svgs = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".svg"))
  .sort();

try {
  const cdp = await connect(await target());
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await sleep(600);

  // 让页面底色透明：截图才带 alpha（omitBackground 在这个 shell 里不生效）
  await cdp.send("Emulation.setDefaultBackgroundColorOverride", {
    color: { r: 0, g: 0, b: 0, a: 0 },
  });

  for (const f of svgs) {
    const src = path.join(dir, f);
    await cdp.send("Page.navigate", { url: `file://${src}` });
    await sleep(700);
    const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
    const out = path.join(outDir, f.replace(/\.svg$/, ".png"));
    fs.writeFileSync(out, Buffer.from(shot.result.data, "base64"));
    console.log("渲染", path.basename(out));
  }

  // ---- 对比图 ----
  const cards = svgs.map((f) => {
    const b64 = fs.readFileSync(path.join(outDir, f.replace(/\.svg$/, ".png"))).toString("base64");
    const name = f.replace(/\.svg$/, "").replace(/^\d+-/, "");
    const data = `data:image/png;base64,${b64}`;
    return `<figure class="card">
      <div class="big"><img src="${data}" width="208" height="208" alt="${name}"></div>
      <figcaption>${name}</figcaption>
      <div class="sizes">
        <img src="${data}" width="64" height="64" alt="">
        <img src="${data}" width="32" height="32" alt="">
        <img src="${data}" width="16" height="16" alt="">
      </div>
    </figure>`;
  });

  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:36px 40px;background:#f4f5f8;
      font:14px/1.4 -apple-system,"PingFang SC",sans-serif;color:#1b1e26}
    h1{font-size:17px;margin:0 0 4px;letter-spacing:.2px}
    p.sub{margin:0 0 26px;color:#7a8091;font-size:13px}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:26px}
    .card{margin:0;background:#fff;border:1px solid #e4e7ec;border-radius:14px;
      padding:16px 16px 12px;display:flex;flex-direction:column;align-items:center;gap:10px}
    .big{filter:drop-shadow(0 6px 14px rgba(20,24,40,.16))}
    figcaption{font-size:13px;color:#3a4052;font-weight:600}
    .sizes{display:flex;align-items:center;gap:14px;opacity:.9}
  </style>
  <h1>dev-helper 图标方案 · ${svgs.length} 款</h1>
  <p class="sub">${path.basename(dir)} · 每款下方是 64 / 32 / 16px 实际尺寸，用来判断小尺寸下的辨识度</p>
  <div class="grid">${cards.join("")}</div>`;

  const sheet = path.join(outDir, "contact-sheet.html");
  fs.writeFileSync(sheet, html);
  // 先把视口调到内容尺寸再导航，否则截图会被裁在 1024x1024
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1024,
    height: 1400,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await cdp.send("Page.navigate", { url: `file://${sheet}` });
  await sleep(1000);
  const full = await cdp.send("Runtime.evaluate", {
    expression: "JSON.stringify({w: document.body.scrollWidth, h: document.body.scrollHeight})",
    returnByValue: true,
  });
  const { w, h } = JSON.parse(full.result.result.value);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: w,
    height: h,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await sleep(700);
  const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(outDir, "contact-sheet.png"), Buffer.from(shot.result.data, "base64"));
  console.log("对比图", path.join(outDir, "contact-sheet.png"), `${w}x${h}`);

  cdp.close();
} catch (e) {
  console.error("失败:", e.message);
  process.exitCode = 1;
} finally {
  proc.kill();
}
