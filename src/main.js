import "./styles.css";

import {
  addRepair,
  completeRepair,
  deleteRepair,
  householdIds,
  householdName,
  registerShares,
  setFilter,
  sharesRegistered,
  startRepair,
  state,
  togglePaid
} from "./state.js";
import {
  ITEM_STATUSES,
  PRIORITIES,
  STATUSES,
  TOTAL_SHARE,
  outstandingAmount,
  parseShareRows,
  shareAmount,
  sumShares,
  unpaidIds
} from "./rules.js";

const app = document.querySelector("#app");

// 纯界面瞬态：刷新后无需保留，登记表单的编辑进度与顶部提示。
let shareEditor = null;
let notice = null;

function render() {
  const repairs = filteredRepairs();
  const unfinished = state.repairs.filter((repair) => repair.status !== "done");
  const totalCost = unfinished.reduce((total, repair) => total + Number(repair.cost || 0), 0);
  const pendingPay = unfinished.reduce((total, repair) => total + outstandingAmount(repair), 0);
  const doing = state.repairs.filter((repair) => repair.status === "doing").length;

  app.innerHTML = `
    <main class="shell">
      <header class="header">
        <div>
          <p class="eyebrow">公共部位 · 共担维修台</p>
          <h1>公共部位共担维修</h1>
          <div class="households">
            ${state.households
              .map((household) => `<span class="household-chip">${escapeHtml(household.name)}</span>`)
              .join("")}
          </div>
        </div>
        <section class="stats">
          <div class="stat"><span>未完工事项</span><strong>${unfinished.length}</strong></div>
          <div class="stat"><span>处理中</span><strong>${doing}</strong></div>
          <div class="stat"><span>预计费用合计</span><strong>¥${formatMoney(totalCost)}</strong></div>
          <div class="stat"><span>待缴分摊金额</span><strong>¥${formatMoney(pendingPay)}</strong></div>
        </section>
      </header>

      ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ""}

      <section class="layout">
        <aside class="panel">
          <h2>新增共担事项</h2>
          <form class="form" id="repair-form">
            <label>公共部位<input name="location" required placeholder="例如楼道、屋顶"></label>
            <label>问题描述<textarea name="title" required placeholder="例如感应灯更换"></textarea></label>
            <label>优先级<select name="priority">${renderPriorityOptions("medium")}</select></label>
            <label>预计费用<input name="cost" type="number" min="0" step="1" value="0"></label>
            <label>照片链接<input name="photo" type="url" placeholder="可选，粘贴图片地址"></label>
            <label>备注<textarea name="note" placeholder="师傅电话、材料或注意事项"></textarea></label>
            <button class="primary" type="submit">保存事项</button>
          </form>
        </aside>

        <section>
          <div class="toolbar">
            ${Object.entries(STATUSES)
              .map(
                ([value, label]) =>
                  `<button class="seg ${state.filter === value ? "active" : ""}" data-filter="${value}">${label}</button>`
              )
              .join("")}
          </div>
          <div class="repairs">
            ${repairs.length ? repairs.map(renderRepair).join("") : `<div class="empty">当前状态下没有共担维修事项</div>`}
          </div>
        </section>
      </section>
    </main>
  `;

  bindEvents();
}

function renderRepair(repair) {
  const registered = sharesRegistered(repair);
  const participantIds = Object.keys(repair.shares || {}).filter((id) => Number(repair.shares[id]) > 0);
  const total = sumShares(repair.shares, participantIds);
  const unpaid = unpaidIds(repair);
  const locked = repair.status === "done";

  return `
    <article class="repair">
      <div class="content">
        <div class="row">
          <h3>${escapeHtml(repair.location)}</h3>
          <span class="priority ${repair.priority}">${PRIORITIES[repair.priority]}</span>
          <span class="status ${repair.status}">${ITEM_STATUSES[repair.status]}</span>
          ${repair.photo ? `<a class="chip link" href="${escapeHtml(repair.photo)}" target="_blank" rel="noreferrer">现场照片</a>` : ""}
        </div>
        <p>${escapeHtml(repair.title)}</p>
        <div class="row">
          <span class="chip">总费用 ¥${formatMoney(Number(repair.cost || 0))}</span>
          <span class="chip ${registered ? "" : "warn"}">${registered ? "已登记分摊" : "尚未登记分摊"}</span>
          <span class="chip ${unpaid.length ? "warn" : "ok"}">${registered ? (unpaid.length ? `待缴 ${unpaid.length} 户` : "各户已缴款") : "—"}</span>
          <span class="chip">${escapeHtml(repair.note || "暂无备注")}</span>
        </div>

        ${renderShareTable(repair, participantIds, total, locked)}
        ${shareEditor?.repairId === repair.id ? renderShareEditor(repair) : ""}

        <div class="actions">
          ${
            locked
              ? `<span class="locked">已完工，分摊与缴款记录锁定</span>`
              : `
                <button class="ghost" data-edit-shares="${repair.id}">${registered ? "调整分摊 / 退出户" : "登记分摊比例"}</button>
                ${repair.status === "todo" ? `<button class="primary" data-start="${repair.id}">开工</button>` : ""}
                ${repair.status === "doing" ? `<button class="primary" data-complete="${repair.id}">完工</button>` : ""}
              `
          }
          <button class="ghost danger" data-delete="${repair.id}">删除</button>
        </div>
      </div>
    </article>
  `;
}

function renderShareTable(repair, participantIds, total, locked) {
  if (!participantIds.length) {
    return `<div class="share-table empty-shares">尚未有任何户登记分摊，需按户登记且合计 100% 后方可开工。</div>`;
  }
  const rows = participantIds
    .map((id) => {
      const percent = Number(repair.shares[id] || 0);
      const paid = repair.paid.includes(id);
      return `
        <div class="share-row-view">
          <span class="cell-name">${escapeHtml(householdName(id))}</span>
          <span class="cell-num">${formatPercent(percent)}%</span>
          <span class="cell-num">¥${formatMoney(shareAmount(repair.cost, percent))}</span>
          <span class="cell-pay">
            <button type="button" class="pay ${paid ? "paid" : ""}" data-pay="${repair.id}:${id}" ${locked ? "disabled" : ""}>
              ${paid ? "已确认缴款" : "确认缴款"}
            </button>
          </span>
        </div>
      `;
    })
    .join("");

  return `
    <div class="share-table">
      <div class="share-head">
        <span>户别</span><span class="cell-num">分摊比例</span><span class="cell-num">应分摊额</span><span class="cell-pay">缴款状态</span>
      </div>
      ${rows}
      <div class="share-foot">
        <span>合计</span>
        <span class="cell-num ${Math.abs(total - TOTAL_SHARE) < 0.001 ? "ok" : "warn"}">${formatPercent(total)}%</span>
        <span class="cell-num">¥${formatMoney(participantIds.reduce((sum, id) => sum + shareAmount(repair.cost, repair.shares[id]), 0))}</span>
        <span></span>
      </div>
    </div>
  `;
}

function renderShareEditor(repair) {
  const activeRows = shareEditor.rows
    .map((id) => {
      const value = shareEditor.values[id] ?? "";
      return `
        <div class="share-edit-row">
          <label>${escapeHtml(householdName(id))}
            <input type="number" min="0" max="100" step="0.1" data-household="${id}" data-share-input value="${escapeHtml(value)}">
          </label>
          <span class="percent-sign">%</span>
          <button type="button" class="ghost small" data-exclude="${id}">退出</button>
        </div>
      `;
    })
    .join("");
  const excludedRows = shareEditor.excluded
    .map(
      (id) => `
        <div class="share-edit-row excluded">
          <span class="excluded-name">${escapeHtml(householdName(id))}（已退出）</span>
          <button type="button" class="ghost small" data-restore="${id}">恢复</button>
        </div>
      `
    )
    .join("");

  return `
    <form class="share-editor" data-share-form="${repair.id}">
      <div class="share-edit-tip">按户填写分摊比例，合计必须为 100%；某户退出后请重填余下各户比例，否则原分摊保持不变。</div>
      <div class="share-edit-grid">${activeRows}</div>
      ${excludedRows ? `<div class="share-excluded">${excludedRows}</div>` : ""}
      <div class="share-edit-foot">
        <span class="live-total ${liveTotalClass(shareEditor)}" data-live-total>合计 ${liveTotalText(shareEditor)}</span>
        <div class="actions">
          <button type="button" class="ghost" data-cancel-share>取消</button>
          <button type="submit" class="primary">提交分摊</button>
        </div>
      </div>
      ${shareEditor.error ? `<p class="form-error">${escapeHtml(shareEditor.error)}</p>` : ""}
      ${shareEditor.rows.length === 0 ? `<p class="form-error">在册户数为 0，请先恢复至少一户再提交。</p>` : ""}
    </form>
  `;
}

function liveTotalValue(editor) {
  const values = editor.rows
    .map((id) => Number(editor.values[id]))
    .filter((value) => Number.isFinite(value));
  if (values.length !== editor.rows.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) * 100) / 100;
}

function liveTotalText(editor) {
  const total = liveTotalValue(editor);
  return total === null ? "—" : `${formatPercent(total)}%（须为 ${TOTAL_SHARE}%）`;
}

function liveTotalClass(editor) {
  const total = liveTotalValue(editor);
  return total !== null && Math.abs(total - TOTAL_SHARE) < 0.001 ? "ok" : "warn";
}

function openEditor(repairId, preExclude = []) {
  const repair = state.repairs.find((item) => item.id === repairId);
  if (!repair) return;
  const current = Object.keys(repair.shares || {}).filter((id) => Number(repair.shares[id]) > 0);
  const base = current.length ? current : householdIds();
  const excluded = preExclude.filter((id) => base.includes(id));
  const rows = base.filter((id) => !excluded.includes(id));
  const values = {};
  rows.forEach((id) => {
    values[id] = current.includes(id) ? trimPercent(repair.shares[id]) : "";
  });
  shareEditor = { repairId, rows, excluded, values, error: null };
  notice = null;
  render();
}

function renderPriorityOptions(selected) {
  return Object.entries(PRIORITIES)
    .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function bindEvents() {
  document.querySelector("#repair-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    addRepair(data);
    notice = null;
    render();
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      setFilter(button.dataset.filter);
      render();
    });
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      deleteRepair(button.dataset.delete);
      if (shareEditor?.repairId === button.dataset.delete) shareEditor = null;
      render();
    });
  });

  document.querySelectorAll("[data-edit-shares]").forEach((button) => {
    button.addEventListener("click", () => openEditor(button.dataset.editShares));
  });

  document.querySelectorAll("[data-pay]").forEach((button) => {
    button.addEventListener("click", () => {
      const [repairId, householdId] = button.dataset.pay.split(":");
      togglePaid(repairId, householdId);
      notice = null;
      render();
    });
  });

  document.querySelectorAll("[data-start]").forEach((button) => {
    button.addEventListener("click", () => {
      const result = startRepair(button.dataset.start);
      notice = result.ok ? null : `无法开工：${result.reason}`;
      render();
    });
  });

  document.querySelectorAll("[data-complete]").forEach((button) => {
    button.addEventListener("click", () => {
      const result = completeRepair(button.dataset.complete);
      notice = result.ok ? null : `无法完工：${result.reason}`;
      render();
    });
  });

  bindShareEditor();
}

function bindShareEditor() {
  const form = document.querySelector("[data-share-form]");
  if (!form || !shareEditor) return;
  const repairId = form.dataset.shareForm;

  form.querySelectorAll("[data-share-input]").forEach((input) => {
    input.addEventListener("input", () => {
      shareEditor.values[input.dataset.household] = input.value;
      shareEditor.error = null;
      const live = form.querySelector("[data-live-total]");
      live.textContent = `合计 ${liveTotalText(shareEditor)}`;
      live.className = `live-total ${liveTotalClass(shareEditor)}`;
      const errorNode = form.querySelector(".form-error");
      if (errorNode) errorNode.remove();
    });
  });

  form.querySelectorAll("[data-exclude]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.exclude;
      shareEditor.rows = shareEditor.rows.filter((row) => row !== id);
      shareEditor.excluded.push(id);
      shareEditor.error = null;
      render();
    });
  });

  form.querySelectorAll("[data-restore]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.restore;
      shareEditor.excluded = shareEditor.excluded.filter((row) => row !== id);
      shareEditor.rows.push(id);
      shareEditor.values[id] ??= "";
      shareEditor.error = null;
      render();
    });
  });

  form.querySelector("[data-cancel-share]").addEventListener("click", () => {
    shareEditor = null;
    notice = null;
    render();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    // 整批校验：合计非 100% 则整次拒绝，原分摊与缴款状态不变。
    const result = registerShares(repairId, parseShareRows([...form.querySelectorAll("[data-share-input]")]));
    if (result.ok) {
      shareEditor = null;
      notice = null;
    } else {
      shareEditor.error = result.reason;
    }
    render();
  });
}

function filteredRepairs() {
  if (state.filter === "all") return state.repairs;
  return state.repairs.filter((repair) => repair.status === state.filter);
}

function trimPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.round(number * 100) / 100) : "";
}

function formatPercent(value) {
  const number = Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(/\.0$/, "");
}

function formatMoney(value) {
  const number = Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

render();
