import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { IS_TAURI } from "./api";

/**
 * # 统一的剪贴板读写
 *
 * Tauri 里走原生插件（不受浏览器权限影响）；浏览器预览里退回
 * `navigator.clipboard`，这样 `npm run dev` 直接打开也能试复制粘贴。
 */

export async function copyText(text: string): Promise<void> {
  if (IS_TAURI) {
    await writeText(text);
    return;
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  throw new Error("当前环境不支持剪贴板");
}

/** 读剪贴板；为空或不支持时返回 null，由调用方决定忽略 */
export async function pasteText(): Promise<string | null> {
  if (IS_TAURI) return readText();
  if (navigator.clipboard?.readText) {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return null;
    }
  }
  return null;
}
