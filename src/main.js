import "./styles.css";
import {
  statuses,
  summarize,
  shareAmount,
  participantIds,
  itemPaidTotal,
  unpaidNames,
  canComplete,
  money,
  TOTAL_SHARE
} from "./rules.js";
import {
  getState,
  setFilter,
  addItem,
  deleteItem,
  updateShares,
  exitHousehold,
  setPaid,
  setStatus
} from "./state.js";

const app = document.querySelector("#app");
// 分摊编辑草稿与提示信息只存在于内存，刷新后自动清空，存档中永远是最近一次生效的数据
const drafts = {}; // { [itemId]: { type: "edit" } | { type: "exit", householdId } }
const notices = {};

function householdName(id) {
  return getState().households.find((h) => h.id === id)?.name || id;
}

function filteredItems() {
  const { items, filter } = getState();
  return filter === "all" ? items : items.filter((item) => item.status === filter);
}

function render() {
  const state = getState();
  const items = filteredItems();
  const stats = summarize(state.items);

  app.innerHTML = `
    <main class="shell">
      <header class="header">
        <div>
          <p class="eyebrow">本地公共部位维护台</p>
          <h1>公共部位共担维修台</h1>
        </div>
        <section class="stats">
          <div class="stat"><span>未完工事项</span><strong>${stats.unfinished}</strong></div>
          <div class="stat"><span>已确认缴款</span><strong>${money(stats.paid)}</strong></div>
          <div class="stat"><span>待收 / 共担总额</span><strong>${money(stats.outstanding)}<small> / ${money(stats.total)}</small></strong></div>
        </section>
      </header>

      <section class="layout">
        <aside class="side">
          <section class="panel">
            <h2>共担住户（四户）</h2>
            <ul class="roster">
              ${state.households
                .map((h) => `<li><span class="door">${escapeHtml(h.name)}</span><span class="chip">在册住户</span></li>`)
                .join("")}
            </ul>
          </section>

          <section class="panel">
            <h2>登记共担事项</h2>
            <p class="rule-note">楼道、屋顶等共担事项按户登记分摊比例，合计必须为 100% 才能保存；全员未缴款前不能完工。</p>
            <form class="form" id="item-form">
              <label>公共部位<input name="location" required placeholder="例如楼道、屋顶"></label>
              <label>维修事项<textarea name="title" required placeholder="例如感应灯更换"></textarea></label>
              <label>预计费用（元）<input name="cost" type="number" min="0" step="0.01" value="0"></label>
              <label>初始状态<select name="status">${renderStatusOptions("todo", false)}</select></label>
              <fieldset class="share-edit">
                <legend>分摊比例（%）</legend>
                <div class="share-grid">
                  ${state.households
                    .map(
                      (h) => `
                    <label class="share-field">${escapeHtml(h.name)}
                      <input name="share-${h.id}" type="number" min="0" max="100" step="0.01" value="25" data-sum-part data-form-share="${h.id}">
                    </label>`
                    )
                    .join("")}
                </div>
                <p class="share-sum">合计：<strong data-sum-display>100.00%</strong></p>
              </fieldset>
              <label>备注<textarea name="note" placeholder="师傅电话、材料或注意事项"></textarea></label>
              <button class="primary" type="submit">保存事项</button>
            </form>
          </section>
        </aside>

        <section>
          <div class="toolbar">
            ${Object.entries(statuses)
              .map(
                ([value, label]) =>
                  `<button class="seg ${state.filter === value ? "active" : ""}" data-filter="${value}">${label}</button>`
              )
              .join("")}
          </div>
          <div class="repairs">
            ${items.length ? items.map(renderItem).join("") : `<div class="empty">当前状态下没有共担维修事项</div>`}
          </div>
        </section>
      </section>
    </main>
  `;

  refreshSumDisplays();
}

function renderItem(item) {
  const draft = drafts[item.id];
  const notice = notices[item.id];
  const locked = item.status === "done";
  const paidTotal = itemPaidTotal(item);

  return `
    <article class="repair" data-item="${item.id}">
      <div class="content">
        <div class="row">
          <h3>${escapeHtml(item.location)}</h3>
          <span class="status ${item.status}">${statuses[item.status]}</span>
          <span class="chip">共担 ${money(item.cost)}</span>
          <span class="chip">已缴 ${money(paidTotal)}</span>
        </div>
        <p>${escapeHtml(item.title)}</p>
        <div class="row">
          <span class="chip">${escapeHtml(item.note || "暂无备注")}</span>
        </div>

        ${notice ? `<p class="notice ${notice.ok ? "ok" : "err"}">${escapeHtml(notice.message)}</p>` : ""}

        ${draft ? renderShareDraft(item, draft) : renderLedger(item, locked)}

        ${
          draft
            ? ""
            : `
          <div class="actions">
            <label class="inline">处理状态
              <select data-status="${item.id}">${renderStatusOptions(item.status, true)}</select>
            </label>
            ${locked ? "" : `<button class="ghost" data-edit-shares="${item.id}">调整分摊</button>`}
            <button class="ghost" data-delete="${item.id}">删除事项</button>
            ${canComplete(item) ? `<span class="ok-text">全员已缴款，可完工</span>` : `<span class="lock-tip">须全部住户确认缴款后方可完工</span>`}
          </div>`
        }
      </div>
    </article>
  `;
}

function renderLedger(item, locked) {
  const ids = participantIds(item);
  return `
    <table class="ledger">
      <thead><tr><th>住户</th><th>分摊比例</th><th>应担金额</th><th>缴款确认</th><th>退出</th></tr></thead>
      <tbody>
        ${ids
          .map(
            (id) => `
          <tr>
            <td>${escapeHtml(householdName(id))}</td>
            <td>${formatPercent(item.shares[id])}%</td>
            <td>${money(shareAmount(item, id))}</td>
            <td>
              <label class="paid">
                <input type="checkbox" data-paid="${id}" ${item.paid[id] ? "checked" : ""} ${locked ? "disabled" : ""}>
                ${item.paid[id] ? "已缴" : "未缴"}
              </label>
            </td>
            <td>${locked ? `<span class="chip">已完工</span>` : `<button class="ghost sm" data-exit="${id}">退出</button>`}</td>
          </tr>`
          )
          .join("")}
      </tbody>
      <tfoot>
        <tr>
          <td>合计</td>
          <td>${formatPercent(sumShares(item))}%</td>
          <td>${money(itemPaidTotal(item))} / ${money(item.cost)}</td>
          <td colspan="2">${paidSummary(item)}</td>
        </tr>
      </tfoot>
    </table>
  `;
}

function renderShareDraft(item, draft) {
  const exitingId = draft.type === "exit" ? draft.householdId : null;
  const ids = participantIds(item).filter((id) => id !== exitingId);
  return `
    <div class="exit-box" data-draft="${draft.type}">
      <p class="rule-note">
        ${
          exitingId
            ? `<strong>${escapeHtml(householdName(exitingId))}</strong> 申请退出，请重填余下 ${ids.length} 户的分摊比例，合计必须为 100%；否则退出无效，保持原分摊。`
            : `请重填各户分摊比例，合计必须为 100%；否则本次拒绝，原分摊与缴款状态不变。`
        }
      </p>
      <div class="share-grid">
        ${ids
          .map(
            (id) => `
          <label class="share-field">${escapeHtml(householdName(id))}
            <input type="number" min="0" max="100" step="0.01" value="${item.shares[id]}" data-sum-part data-draft-share="${id}">
          </label>`
          )
          .join("")}
      </div>
      <p class="share-sum">合计：<strong data-sum-display></strong></p>
      <div class="actions">
        <button class="primary" data-draft-confirm>${exitingId ? "确认退出与新分摊" : "保存新分摊"}</button>
        <button class="ghost" data-draft-cancel>取消，保持原分摊</button>
      </div>
    </div>
  `;
}

function paidSummary(item) {
  const unpaid = unpaidNames(item, getState().households);
  return unpaid.length === 0
    ? `<span class="ok-text">全部已缴</span>`
    : `未缴：${unpaid.map(escapeHtml).join("、")}`;
}

function sumShares(item) {
  return Object.values(item.shares).reduce((a, b) => a + Number(b || 0), 0);
}

function formatPercent(value) {
  return (Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2);
}

function renderStatusOptions(selected, includeDone) {
  return Object.entries(statuses)
    .filter(([value]) => value !== "all" && (includeDone || value !== "done"))
    .map(
      ([value, label]) =>
        `<option value="${value}" ${selected === value ? "selected" : ""}>${label}${
          value === "done" ? "（须全员缴款）" : ""
        }</option>`
    )
    .join("");
}

function refreshSumDisplays(root = document) {
  root.querySelectorAll("[data-sum-display]").forEach((display) => {
    const scope = display.closest("form, .exit-box");
    const inputs = scope.querySelectorAll("[data-sum-part]");
    const sum = [...inputs].reduce((acc, input) => acc + (Number(input.value) || 0), 0);
    const rounded = Math.round((sum + Number.EPSILON) * 100) / 100;
    display.textContent = `${rounded.toFixed(2)}%`;
    display.classList.toggle("bad", rounded !== TOTAL_SHARE);
  });
}

function collectDraftShares(scope) {
  const shares = {};
  scope.querySelectorAll("[data-draft-share]").forEach((input) => {
    shares[input.dataset.draftShare] = input.value;
  });
  return shares;
}

function collectFormShares(scope) {
  const shares = {};
  scope.querySelectorAll("[data-form-share]").forEach((input) => {
    shares[input.dataset.formShare] = input.value;
  });
  return shares;
}

function flash(itemId, result) {
  notices[itemId] = {
    ok: result.ok,
    message: result.message || (result.ok ? "操作成功" : "操作失败")
  };
}

// 统一事件委托：筛选、删除、调整分摊、退出、确认、取消
app.addEventListener("click", (event) => {
  const filterBtn = event.target.closest("button[data-filter]");
  if (filterBtn) {
    setFilter(filterBtn.dataset.filter);
    render();
    return;
  }

  const btn = event.target.closest(
    "button[data-delete], button[data-edit-shares], button[data-exit], button[data-draft-confirm], button[data-draft-cancel]"
  );
  if (!btn) return;

  const card = btn.closest(".repair");
  const itemId = card?.dataset.item;
  if (!itemId) return;

  if (btn.hasAttribute("data-delete")) {
    deleteItem(itemId);
    delete drafts[itemId];
    delete notices[itemId];
    render();
    return;
  }

  if (btn.hasAttribute("data-edit-shares")) {
    drafts[itemId] = { type: "edit" };
    delete notices[itemId];
    render();
    return;
  }

  if (btn.hasAttribute("data-exit")) {
    drafts[itemId] = { type: "exit", householdId: btn.dataset.exit };
    delete notices[itemId];
    render();
    return;
  }

  if (btn.hasAttribute("data-draft-cancel")) {
    delete drafts[itemId];
    notices[itemId] = { ok: true, message: "已取消，原分摊与缴款状态不变" };
    render();
    return;
  }

  if (btn.hasAttribute("data-draft-confirm")) {
    const draft = drafts[itemId];
    const result =
      draft.type === "exit"
        ? exitHousehold(itemId, draft.householdId, collectDraftShares(card))
        : updateShares(itemId, collectDraftShares(card));
    flash(itemId, result);
    if (result.ok) delete drafts[itemId];
    render();
  }
});

app.addEventListener("change", (event) => {
  const input = event.target;

  if (input.hasAttribute("data-sum-part")) {
    refreshSumDisplays();
    return;
  }

  const card = input.closest(".repair");
  if (!card) return;
  const itemId = card.dataset.item;

  if (input.dataset.status !== undefined) {
    const result = setStatus(itemId, input.value);
    if (!result.ok) flash(itemId, result);
    render();
  } else if (input.dataset.paid !== undefined) {
    setPaid(itemId, input.dataset.paid, input.checked);
    delete notices[itemId];
    render();
  }
});

app.addEventListener("submit", (event) => {
  if (event.target.id !== "item-form") return;
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));
  const result = addItem(data, collectFormShares(form));
  if (!result.ok) {
    alert(result.message);
    refreshSumDisplays();
    return;
  }
  render();
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

render();
