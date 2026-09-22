// 应用状态：预置四户与三项共担事项，所有变更经规则校验后落本地存档。

import { loadArchive, saveArchive, archiveVersion } from "./storage.js";
import {
  completionBlockers,
  evaluateShares,
  round2,
  sharesValid,
  startBlockers,
  TOTAL_SHARE
} from "./rules.js";

const DEFAULT_HOUSEHOLDS = [
  { id: "h-101", name: "101室" },
  { id: "h-102", name: "102室" },
  { id: "h-201", name: "201室" },
  { id: "h-202", name: "202室" }
];

const defaultHouseholdIds = () => DEFAULT_HOUSEHOLDS.map((household) => household.id);

function evenShares() {
  const shares = {};
  defaultHouseholdIds().forEach((id) => {
    shares[id] = TOTAL_SHARE / DEFAULT_HOUSEHOLDS.length;
  });
  return shares;
}

function initialRepairs() {
  const base = {
    priority: "medium",
    status: "todo",
    photo: "",
    shares: {},
    paid: []
  };
  return [
    {
      ...base,
      id: crypto.randomUUID(),
      location: "楼道",
      title: "二层楼道感应灯更换并检修线路",
      priority: "high",
      cost: 360,
      note: "含人工费，楼道照明共担",
      shares: evenShares(),
      paid: ["h-101", "h-102"]
    },
    {
      ...base,
      id: crypto.randomUUID(),
      location: "屋顶",
      title: "屋顶防水层局部翻新（雨季前）",
      priority: "high",
      cost: 4800,
      status: "doing",
      note: "先查渗漏点再铺卷材，四户均摊",
      shares: evenShares()
    },
    {
      ...base,
      id: crypto.randomUUID(),
      location: "单元门",
      title: "单元门对讲门禁维修",
      priority: "low",
      cost: 600,
      note: "公共门禁，比例待四户登记"
    }
  ];
}

export function createInitialState() {
  return {
    version: archiveVersion(),
    filter: "all",
    households: DEFAULT_HOUSEHOLDS.map((household) => ({ ...household })),
    repairs: initialRepairs()
  };
}

function normalizeState(data) {
  return {
    ...createInitialState(),
    ...data,
    households: data.households.map((household) => ({ ...household })),
    repairs: data.repairs.map((repair) => ({
      ...repair,
      shares: repair.shares ? { ...repair.shares } : {},
      paid: Array.isArray(repair.paid) ? [...repair.paid] : []
    }))
  };
}

export let state = normalizeState(loadArchive() || createInitialState());

function persist() {
  saveArchive(state);
}

export const householdName = (id) => state.households.find((household) => household.id === id)?.name || "已退出户";
export const householdIds = () => state.households.map((household) => household.id);

export function setFilter(filter) {
  state.filter = filter;
  persist();
}

export function addRepair(data) {
  state.repairs.unshift({
    id: crypto.randomUUID(),
    location: data.location.trim(),
    title: data.title.trim(),
    priority: data.priority,
    cost: Number(data.cost || 0),
    status: "todo",
    photo: data.photo.trim(),
    note: data.note.trim(),
    shares: {},
    paid: []
  });
  persist();
}

export function deleteRepair(id) {
  state.repairs = state.repairs.filter((repair) => repair.id !== id);
  persist();
}

// 共担登记 / 退出重摊：整批校验合计 100%，不通过则整体拒绝，原分摊与缴款状态不变。
export function registerShares(repairId, rows) {
  const repair = state.repairs.find((item) => item.id === repairId);
  if (!repair) return { ok: false, reason: "事项不存在" };

  const result = evaluateShares(rows);
  if (!result.ok) return result;

  repair.shares = {};
  rows.forEach((row) => {
    repair.shares[row.id] = round2(row.percent);
  });
  // 退出户（本轮未登记的在册户）清出分摊，已缴款记录一并失效；其余户缴款状态保留。
  const nextIds = rows.map((row) => row.id);
  repair.paid = repair.paid.filter((id) => nextIds.includes(id));
  if (repair.status === "done") repair.status = "doing";
  persist();
  return { ok: true };
}

export function togglePaid(repairId, householdId) {
  const repair = state.repairs.find((item) => item.id === repairId);
  if (!repair || repair.status === "done") return;
  if (!(householdId in (repair.shares || {}))) return;

  if (repair.paid.includes(householdId)) {
    repair.paid = repair.paid.filter((id) => id !== householdId);
  } else {
    repair.paid.push(householdId);
  }
  persist();
}

export function startRepair(repairId) {
  const repair = state.repairs.find((item) => item.id === repairId);
  if (!repair) return { ok: false, reason: "事项不存在" };
  const blockers = startBlockers(repair);
  if (blockers.length) return { ok: false, reason: blockers[0] };
  if (repair.status === "todo") repair.status = "doing";
  persist();
  return { ok: true };
}

// 完工：任一户未确认缴款前不得完工。
export function completeRepair(repairId) {
  const repair = state.repairs.find((item) => item.id === repairId);
  if (!repair) return { ok: false, reason: "事项不存在" };
  const blockers = completionBlockers(repair);
  if (blockers.length) return { ok: false, reason: blockers[0] };
  repair.status = "done";
  persist();
  return { ok: true };
}

export function sharesRegistered(repair) {
  return sharesValid(repair.shares, Object.keys(repair.shares || {}));
}
