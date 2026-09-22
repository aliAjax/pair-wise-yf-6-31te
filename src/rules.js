// 业务规则层：共担比例、缴款与完工约束，全部为纯函数

export const TOTAL_SHARE = 100;

export const statuses = {
  all: "全部",
  todo: "待处理",
  doing: "处理中",
  done: "已完成"
};

// 预置四户
export const seedHouseholds = [
  { id: "h101", name: "101室" },
  { id: "h102", name: "102室" },
  { id: "h201", name: "201室" },
  { id: "h202", name: "202室" }
];

export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function parsePercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > TOTAL_SHARE) return null;
  return round2(n);
}

// 校验提交的分摊：每户都须存在且合法，合计必须恰好 100%
export function validateShares(rawShares, expectedIds) {
  const shares = {};
  for (const id of expectedIds) {
    const parsed = parsePercent(rawShares[id]);
    if (parsed === null) {
      return { ok: false, message: "分摊比例须为 0–100 之间的数字" };
    }
    shares[id] = parsed;
  }
  const sum = round2(Object.values(shares).reduce((a, b) => a + b, 0));
  if (sum !== TOTAL_SHARE) {
    return { ok: false, message: `分摊比例合计为 ${sum}%，必须等于 100%，本次操作已拒绝` };
  }
  return { ok: true, shares };
}

export function participantIds(item) {
  return Object.keys(item.shares);
}

export function shareAmount(item, householdId) {
  const ratio = Number(item.shares[householdId] || 0) / TOTAL_SHARE;
  return round2(Number(item.cost || 0) * ratio);
}

export function paidIds(item) {
  return participantIds(item).filter((id) => item.paid[id]);
}

export function allPaid(item) {
  return participantIds(item).length > 0 && paidIds(item).length === participantIds(item).length;
}

export function unpaidNames(item, households) {
  return participantIds(item)
    .filter((id) => !item.paid[id])
    .map((id) => households.find((h) => h.id === id)?.name || id);
}

// 任一户未确认缴款前不得完工
export function canComplete(item) {
  return allPaid(item);
}

// 允许切换到的目标状态：未全部缴款时禁止标记已完成
export function allowStatus(item, next) {
  if (next === "done" && !canComplete(item)) {
    return { ok: false, message: `尚有住户未确认缴款，不能完工` };
  }
  return { ok: true };
}

export function itemPaidTotal(item) {
  return round2(
    paidIds(item).reduce((sum, id) => sum + shareAmount(item, id), 0)
  );
}

// 费用统计：共担总额、已确认缴款、待收
export function summarize(items) {
  const total = round2(items.reduce((sum, item) => sum + Number(item.cost || 0), 0));
  const paid = round2(items.reduce((sum, item) => sum + itemPaidTotal(item), 0));
  const unfinished = items.filter((item) => item.status !== "done").length;
  return { total, paid, outstanding: round2(total - paid), unfinished };
}

export function money(value) {
  return `¥${round2(value).toFixed(2)}`;
}
