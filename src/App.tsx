import { useEffect, useState, type ComponentType } from "react";
import { flushSync } from "react-dom";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { StatusBar } from "./components/StatusBar";
import { TOOLS } from "./lib/tools";
import {
  applyTheme,
  loadTheme,
  resolveDark,
  saveTheme,
  withThemeTransition,
  type Theme,
  type ThemeOrigin,
} from "./lib/theme";
import { loadFavs, saveFavs } from "./lib/store";
import { IS_TAURI } from "./lib/api";
import Toolbox from "./pages/Toolbox";
import Hash from "./pages/Hash";
import Password from "./pages/Password";
import Uuid from "./pages/Uuid";
import Qrcode from "./pages/Qrcode";
import Regex from "./pages/Regex";
import Diff from "./pages/Diff";
import Text from "./pages/Text";

const PAGES: Record<string, ComponentType> = {
  toolbox: Toolbox,
  hash: Hash,
  password: Password,
  uuid: Uuid,
  qrcode: Qrcode,
  regex: Regex,
  diff: Diff,
  text: Text,
};

export default function App() {
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [active, setActive] = useState("toolbox");
  const [favorites, setFavorites] = useState<string[]>(loadFavs);

  useEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  function toggleFav(id: string) {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      saveFavs(next);
      return next;
    });
  }

  /** 点按钮切换主题：以按钮中心为圆心，把新主题铺满窗口 */
  function toggleTheme(origin?: ThemeOrigin) {
    const next: Theme = theme === "dark" ? "light" : "dark";
    withThemeTransition(origin, () => {
      // 先直接落 DOM，不依赖 effect 的执行时机，保证快照拍到的是新主题
      applyTheme(next);
      flushSync(() => setTheme(next));
    });
  }

  const meta = TOOLS.find((t) => t.id === active) ?? TOOLS[0];
  const Page = PAGES[active];

  return (
    <div className={`app${IS_TAURI ? " is-tauri" : ""}`}>
      <Sidebar
        active={active}
        favorites={favorites}
        onSelect={setActive}
        onToggleFav={toggleFav}
      />
      <main className="content" data-tauri-drag-region>
        <div className="content__inner" data-tauri-drag-region>
          <Header
            meta={meta}
            dark={resolveDark(theme)}
            isFav={favorites.includes(active)}
            onToggleTheme={toggleTheme}
            onToggleFav={() => toggleFav(active)}
          />
          {Page ? <Page /> : <div className="card muted">这个工具还在做，先看看别的。</div>}
        </div>
      </main>
      <StatusBar />
    </div>
  );
}
