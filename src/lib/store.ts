const FAV_KEY = "dh-favs";

export function loadFavs(): string[] {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return [];
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveFavs(ids: string[]) {
  localStorage.setItem(FAV_KEY, JSON.stringify(ids));
}
