import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Tauri 在构建时吞掉 Vite 的清屏输出，避免把 Rust 编译日志冲掉
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: {
      // 不要监听 Rust 后端，避免触发无谓的前端重载
      ignored: ["**/src-tauri/**"],
    },
  },
});
