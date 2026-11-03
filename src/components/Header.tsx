import { useRef } from "react";
import { Moon, Star, Sun } from "lucide-react";
import type { ThemeOrigin } from "../lib/theme";
import type { ToolMeta } from "../lib/tools";

export function Header({
  meta,
  dark,
  isFav,
  onToggleTheme,
  onToggleFav,
}: {
  meta: ToolMeta;
  dark: boolean;
  isFav: boolean;
  /** 圆心取主题按钮的中心，点边缘或键盘触发都从同一个点扩散 */
  onToggleTheme: (origin?: ThemeOrigin) => void;
  onToggleFav: () => void;
}) {
  const themeBtn = useRef<HTMLButtonElement>(null);

  function handleThemeClick() {
    const r = themeBtn.current?.getBoundingClientRect();
    onToggleTheme(r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : undefined);
  }

  return (
    <header className="page-header" data-tauri-drag-region="deep">
      <div className="page-header__text">
        <h1 className="page-header__title">{meta.name}</h1>
        <div className="page-header__desc">{meta.desc}</div>
      </div>
      <div className="page-header__actions">
        <button
          type="button"
          className={`header-btn ${isFav ? "star-on" : ""}`}
          onClick={onToggleFav}
          title={isFav ? "取消收藏" : "收藏"}
        >
          <Star size={15} fill={isFav ? "currentColor" : "none"} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          ref={themeBtn}
          className="header-btn"
          onClick={handleThemeClick}
          title="切换主题"
        >
          <span className="header-btn__icon" key={dark ? "sun" : "moon"}>
            {dark ? <Sun size={15} strokeWidth={1.8} /> : <Moon size={15} strokeWidth={1.8} />}
          </span>
        </button>
      </div>
    </header>
  );
}
