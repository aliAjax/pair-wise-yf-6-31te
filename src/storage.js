// 本地存档层：只负责 localStorage 的读写，不包含任何业务判断
const STORAGE_KEY = "zfl-14-shared-repairs";

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.households) || !Array.isArray(data.items)) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
