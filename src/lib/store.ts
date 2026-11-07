const FAV_KEY = "dh-favs";

/** 旧顶层菜单拆回三个入口后，把历史收藏 id 指到对应的新菜单，避免入口丢失 */
const LEGACY_FAV: Record<string, string> = {
  toolbox: "formatter",
  formatter: "formatter",
  json: "formatter",
  format: "formatter",
  jsformat: "formatter",
  converter: "converter",
  timestamp: "converter",
  base64: "converter",
  url: "converter",
  kvjson: "converter",
  parser: "parser",
  color: "parser",
  jwt: "parser",
  cron: "parser",
};

export function loadFavs(): string[] {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return [];
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    const out: string[] = [];
    for (const x of v) {
      if (typeof x !== "string") continue;
      const id = LEGACY_FAV[x] ?? x;
      if (!out.includes(id)) out.push(id);
    }
    return out;
  } catch {
    return [];
  }
}

export function saveFavs(ids: string[]) {
  localStorage.setItem(FAV_KEY, JSON.stringify(ids));
}

const COLLAPSE_KEY = "dh-collapsed-groups";

/** 侧边栏分组折叠状态；默认全部展开（空数组） */
export function loadCollapsedGroups(): string[] {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (!raw) return [];
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveCollapsedGroups(groups: string[]) {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(groups));
  } catch {
    /* 存储不可用时只影响本次折叠记忆 */
  }
}
