// 状态层：持有内存数据并执行业务变更，每次变更与本地存档同步
import { loadState, saveState } from "./storage.js";
import {
  seedHouseholds,
  statuses,
  validateShares,
  allowStatus
} from "./rules.js";

function seedItems() {
  const even = { h101: 25, h102: 25, h201: 25, h202: 25 };
  return [
    {
      id: crypto.randomUUID(),
      location: "楼道",
      title: "楼道感应灯更换与线路检修",
      cost: 480,
      status: "doing",
      note: "三楼到四楼灯不亮，已约电工",
      shares: { ...even },
      paid: { h101: true, h102: false, h201: true, h202: false }
    },
    {
      id: crypto.randomUUID(),
      location: "屋顶",
      title: "屋顶防水层重做",
      cost: 3600,
      status: "todo",
      note: "雨季前完工，顶楼两户多担",
      shares: { h101: 20, h102: 20, h201: 30, h202: 30 },
      paid: { h101: false, h102: false, h201: false, h202: false }
    },
    {
      id: crypto.randomUUID(),
      location: "外墙",
      title: "外墙落水管更换",
      cost: 1200,
      status: "done",
      note: "已更换整段 PVC 管",
      shares: { ...even },
      paid: { h101: true, h102: true, h201: true, h202: true }
    }
  ];
}

function defaultState() {
  return { filter: "all", households: seedHouseholds, items: seedItems() };
}

let state = loadState() ?? defaultState();
persist();

function persist() {
  saveState(state);
}

export function getState() {
  return state;
}

export function setFilter(filter) {
  state.filter = statuses[filter] ? filter : "all";
  persist();
}

export function addItem(data, rawShares) {
  const location = data.location.trim();
  const title = data.title.trim();
  const cost = Number(data.cost || 0);
  if (!location || !title || !(cost >= 0)) {
    return { ok: false, message: "请填写部位、事项与合法费用" };
  }

  const ids = state.households.map((h) => h.id);
  const result = validateShares(rawShares, ids);
  if (!result.ok) return result;

  // 新增事项默认不能直接完工；若选择已完成但未缴款则回落到待处理
  const status = data.status === "done" ? "todo" : data.status;
  const item = {
    id: crypto.randomUUID(),
    location,
    title,
    cost,
    status,
    note: data.note.trim(),
    shares: result.shares,
    paid: Object.fromEntries(ids.map((id) => [id, false]))
  };
  state.items.unshift(item);
  persist();
  return { ok: true, message: "共担事项已登记" };
}

export function deleteItem(itemId) {
  state.items = state.items.filter((item) => item.id !== itemId);
  persist();
}

// 重填在住户的分摊比例；合计不为 100% 时整次拒绝，原分摊与缴款状态不变
export function updateShares(itemId, rawShares) {
  const item = state.items.find((i) => i.id === itemId);
  if (!item) return { ok: false, message: "事项不存在" };
  const result = validateShares(rawShares, Object.keys(item.shares));
  if (!result.ok) return result;

  // 校验通过才落库；分摊金额义务变化，缴款需各户重新确认
  item.shares = result.shares;
  for (const id of Object.keys(item.paid)) item.paid[id] = false;
  if (item.status === "done") item.status = "doing";
  persist();
  return { ok: true, message: "新分摊已生效（合计 100%），请各户重新确认缴款" };
}

// 某户退出：余下各户比例重填且仍合计 100% 才生效，否则保持原分摊
export function exitHousehold(itemId, householdId, rawShares) {
  const item = state.items.find((i) => i.id === itemId);
  if (!item) return { ok: false, message: "事项不存在" };
  const remaining = Object.keys(item.shares).filter((id) => id !== householdId);
  if (remaining.length === 0) return { ok: false, message: "至少保留一户，不能退出" };

  const result = validateShares(rawShares, remaining);
  if (!result.ok) return result;

  const paid = {};
  for (const id of remaining) paid[id] = false; // 分摊结构变化，缴款需重新确认
  item.shares = result.shares;
  item.paid = paid;
  if (item.status === "done") item.status = "doing";
  persist();
  return { ok: true, message: "该户已退出，余下各户按新比例分摊" };
}

export function setPaid(itemId, householdId, value) {
  const item = state.items.find((i) => i.id === itemId);
  if (!item || !(householdId in item.shares)) return;
  item.paid[householdId] = Boolean(value);
  persist();
}

export function setStatus(itemId, next) {
  const item = state.items.find((i) => i.id === itemId);
  if (!item || !statuses[next] || next === "all") return { ok: false, message: "" };
  const check = allowStatus(item, next);
  if (!check.ok) return check;
  item.status = next;
  persist();
  return { ok: true };
}
