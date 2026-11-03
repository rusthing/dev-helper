import { useMemo, useState } from "react";
import { Search, Star } from "lucide-react";
import { Icon } from "./Icon";
import { GROUPS, TOOLS, matchTool, type ToolMeta } from "../lib/tools";
import logoUrl from "../assets/logo-mark.svg";

interface Props {
  active: string;
  favorites: string[];
  onSelect: (id: string) => void;
  onToggleFav: (id: string) => void;
}

export function Sidebar({ active, favorites, onSelect, onToggleFav }: Props) {
  const [q, setQ] = useState("");

  const { fav, rest } = useMemo(() => {
    const hit = (t: ToolMeta) => matchTool(t, q);
    return {
      fav: TOOLS.filter((t) => favorites.includes(t.id) && hit(t)),
      rest: GROUPS.map((g) => ({
        label: g,
        items: TOOLS.filter((t) => t.group === g && hit(t)),
      })).filter((s) => s.items.length > 0),
    };
  }, [q, favorites]);

  return (
    <aside className="sidebar">
      <div className="sidebar__brand" data-tauri-drag-region="deep">
        {/* 机器人本体，没有蓝色底块：和 .app 图标同一套配色，
            尺寸由 CSS 的 height 决定（宽高比跟着 viewBox 走） */}
        <img className="sidebar__logo" src={logoUrl} alt="" />
        <div className="sidebar__title">Dev Helper</div>
      </div>

      <div className="sidebar__search">
        <div className="search-input">
          <Search size={14} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索工具 / 拼音首字母…"
            spellCheck={false}
          />
        </div>
      </div>

      <div className="sidebar__list">
        {fav.length > 0 && (
          <>
            <div className="nav-group__label">收藏</div>
            {fav.map((t) => (
              <NavItem
                key={`fav-${t.id}`}
                tool={t}
                active={active === t.id}
                fav
                onSelect={onSelect}
                onToggleFav={onToggleFav}
              />
            ))}
          </>
        )}

        {rest.map((s) => (
          <div key={s.label}>
            <div className="nav-group__label">{s.label}</div>
            {s.items.map((t) => (
              <NavItem
                key={t.id}
                tool={t}
                active={active === t.id}
                fav={favorites.includes(t.id)}
                onSelect={onSelect}
                onToggleFav={onToggleFav}
              />
            ))}
          </div>
        ))}

        {fav.length === 0 && rest.length === 0 && (
          <div className="nav-group__label">没有匹配的工具</div>
        )}
      </div>
    </aside>
  );
}

function NavItem({
  tool,
  active,
  fav,
  onSelect,
  onToggleFav,
}: {
  tool: ToolMeta;
  active: boolean;
  fav: boolean;
  onSelect: (id: string) => void;
  onToggleFav: (id: string) => void;
}) {
  return (
    <div
      className={`nav-item ${active ? "active" : ""}`}
      onClick={() => onSelect(tool.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect(tool.id);
      }}
    >
      <span className="nav-item__icon">
        <Icon name={tool.icon} size={16} strokeWidth={1.8} />
      </span>
      <span className="nav-item__label">{tool.name}</span>
      <span
        className={`nav-item__star ${fav ? "on" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFav(tool.id);
        }}
        title={fav ? "取消收藏" : "收藏"}
      >
        <Star size={13} fill={fav ? "currentColor" : "none"} strokeWidth={1.8} />
      </span>
    </div>
  );
}
