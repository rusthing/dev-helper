import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyText } from "../lib/clipboard";

/**
 * 复制按钮：只出图标，不带文字。
 *
 * 它散落在卡片标题右侧、键值行、输入框操作行里，带“复制”二字会把整列撑得很吵；
 * 含义交给 title，悬停即见，成功时图标换成对勾并变绿，不需要靠文字表达状态。
 */
export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  async function copy() {
    if (!text) return;
    try {
      await copyText(text);
      setDone(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setDone(false), 1200);
    } catch (e) {
      console.error("复制失败", e);
    }
  }

  const hint = done ? "已复制" : "复制";

  return (
    <button
      type="button"
      className={`btn icon-only copy-icon ${done ? "is-done" : ""}`}
      onClick={copy}
      disabled={!text}
      title={hint}
      aria-label={hint}
    >
      {done ? <Check size={15} /> : <Copy size={15} />}
    </button>
  );
}
