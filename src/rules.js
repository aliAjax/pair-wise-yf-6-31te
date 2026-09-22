// 业务规则：状态口径、共担比例校验、完工前置条件，均为纯函数。

export const STATUSES = {
  all: "全部",
  todo: "待处理",
  doing: "处理中",
  done: "已完工"
};

export const ITEM_STATUSES = {
  todo: "待处理",
  doing: "处理中",
  done: "已完工"
};

export const PRIORITIES = {
  high: "高优先级",
  medium: "中优先级",
  low: "低优先级"
};

export const TOTAL_SHARE = 100;
export const SHARE_EPSILON = 0.001;

export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

// 单户应分摊金额（先按比例计算再四舍五入到分）。
export function shareAmount(cost, percent) {
  return round2((Number(cost || 0) * Number(percent || 0)) / TOTAL_SHARE);
}

export function participantIds(shares) {
  if (!shares) return [];
  return Object.entries(shares)
    .filter(([, percent]) => Number(percent) > 0)
    .map(([id]) => id);
}

export function sumShares(shares, ids) {
  const source = shares || {};
  const list = ids || Object.keys(source);
  return round2(list.reduce((total, id) => total + Number(source[id] || 0), 0));
}

// 共担登记整批校验：所有在册户比例为正，且合计必须精确到 100%。
export function evaluateShares(rows) {
  const values = rows.map((row) => Number(row.percent));
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
    return { ok: false, reason: "在册各户比例必须为大于 0 的数字" };
  }
  const total = round2(values.reduce((sum, value) => sum + value, 0));
  if (Math.abs(total - TOTAL_SHARE) > SHARE_EPSILON) {
    return { ok: false, reason: `合计为 ${total}%，必须等于 100%，本次登记已拒绝` };
  }
  return { ok: true, total, values };
}

// 解析表单内比例输入；空白与非数字视为缺失，交给整批校验拒绝。
export function parseShareRows(inputs) {
  return inputs.map((input) => ({
    id: input.dataset.household,
    percent: input.value.trim() === "" ? Number.NaN : Number(input.value)
  }));
}

export function sharesValid(shares, householdIds) {
  const ids = participantIds(shares);
  if (!ids.length) return false;
  if (householdIds.some((id) => !ids.includes(id))) return false;
  return Math.abs(sumShares(shares, ids) - TOTAL_SHARE) <= SHARE_EPSILON;
}

export function unpaidIds(repair) {
  const shares = repair.shares || {};
  const paid = repair.paid || [];
  return participantIds(shares).filter((id) => !paid.includes(id));
}

export function outstandingAmount(repair) {
  return round2(
    unpaidIds(repair).reduce((total, id) => total + shareAmount(repair.cost, repair.shares[id]), 0)
  );
}

// 开工前置：须先完成合计 100% 的共担登记。
export function startBlockers(repair) {
  const blockers = [];
  if (!sharesValid(repair.shares, participantIds(repair.shares))) {
    blockers.push("需先完成共担登记（合计 100%）");
  }
  return blockers;
}

// 完工前置：共担登记有效，且任一户未确认缴款前不得完工。
export function completionBlockers(repair) {
  const blockers = startBlockers(repair);
  const unpaid = unpaidIds(repair);
  if (unpaid.length) {
    blockers.push(`仍有 ${unpaid.length} 户未确认缴款`);
  }
  return blockers;
}
