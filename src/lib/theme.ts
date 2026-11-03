export type Theme = "light" | "dark" | "system";

const KEY = "dh-theme";

export function loadTheme(): Theme {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

export function saveTheme(t: Theme) {
  localStorage.setItem(KEY, t);
}

export function resolveDark(t: Theme): boolean {
  if (t === "dark") return true;
  if (t === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(t: Theme) {
  const dark = resolveDark(t);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

/** 圆形扩散的圆心（一般是点击位置，单位 px） */
export type ThemeOrigin = { x: number; y: number };

/** 扩散动画时长，与 app.css 里的降级过渡时长保持同一量级 */
const SPREAD_MS = 480;
const FADE_MS = 200;

type ViewTransitionLike = { ready: Promise<void> };

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => ViewTransitionLike;
};

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * # 以 origin 为圆心切换主题
 *
 * 用 View Transitions 把「新主题」当作一层快照，用 clip-path 的圆从点击点
 * 向外扩散，视觉上就是主题从按钮位置「铺」满整个窗口。
 *
 * ## 参数
 * - `origin`：圆心坐标，缺省时取右上角（主题按钮所在位置）
 * - `commit`：真正落地主题的回调，必须是同步的（改 DOM + 更新状态）
 *
 * ## 降级
 * 不支持 View Transitions（旧 WebView）或用户开启了「减少动态效果」时，
 * 不播放圆形扩散，改为整页颜色的短暂过渡。
 */
export function withThemeTransition(origin: ThemeOrigin | undefined, commit: () => void) {
  const root = document.documentElement;
  const startViewTransition = (document as ViewTransitionDocument).startViewTransition;

  if (!startViewTransition || prefersReducedMotion()) {
    root.classList.add("theme-fading");
    commit();
    window.setTimeout(() => root.classList.remove("theme-fading"), FADE_MS + 80);
    return;
  }

  const x = origin?.x ?? window.innerWidth - 44;
  const y = origin?.y ?? 44;
  // 圆心到最远角的距离，保证圆能完全盖住窗口
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );

  let transition: ViewTransitionLike;
  try {
    transition = startViewTransition.call(document, commit);
  } catch {
    // 上一次动画还没结束等异常情况，直接切过去，不能让主题停在旧状态
    commit();
    return;
  }

  transition.ready
    .then(() => {
      root.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${radius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: SPREAD_MS,
          easing: "cubic-bezier(.25, .46, .3, 1)",
          fill: "both",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    })
    .catch(() => {
      /* 动画被跳过（例如页面切走）：没有副作用 */
    });
}
