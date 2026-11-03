import { invoke } from "@tauri-apps/api/core";

export const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * 统一的命令调用入口。
 *
 * 在 Tauri 里走真实 IPC；在浏览器里（`npm run dev` 直接打开 1420）
 * 走开发态 mock，这样不启动桌面壳也能调布局、截图核对。
 * 生产构建时 `import.meta.env.DEV` 为 false，mock 会被 tree-shake 掉。
 */
export async function call<T>(
  cmd: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (IS_TAURI) return invoke<T>(cmd, args);
  if (import.meta.env.DEV) {
    const { mockInvoke } = await import("./mock");
    return mockInvoke(cmd, args) as T;
  }
  return invoke<T>(cmd, args);
}
