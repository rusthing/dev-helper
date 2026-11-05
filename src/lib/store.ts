const FAV_KEY = "dh-favs";

/** 合并进工具箱后，旧的顶层菜单 id 统一迁移到 toolbox，避免老收藏凭空消失 */
const LEGACY_FAV: Record<string, string> = {
  timestamp: "toolbox",
  color: "toolbox",
  base64: "toolbox",
  url: "toolbox",
  json: "toolbox",
  format: "toolbox",
  jsformat: "toolbox",
  jwt: "toolbox",
  kvjson: "toolbox",
  formatter: "toolbox",
  converter: "toolbox",
  cron: "toolbox",
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
