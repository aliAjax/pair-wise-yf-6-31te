// 本地存档：只负责公共部位共担维修数据的读取与写入，不夹带业务判断。

const STORAGE_KEY = "zfl-14-repairs";
const ARCHIVE_VERSION = 2;

export function loadArchive() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!isValidArchive(data)) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveArchive(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function archiveVersion() {
  return ARCHIVE_VERSION;
}

function isValidArchive(data) {
  return (
    Boolean(data) &&
    data.version === ARCHIVE_VERSION &&
    Array.isArray(data.households) &&
    Array.isArray(data.repairs)
  );
}
