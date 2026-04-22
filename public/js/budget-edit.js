function parseMoney(s) {
  const n = parseFloat(String(s).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

/** 항목 배정액: 원 단위 정수로 합산 */
function parseAllocatedInt(s) {
  return Math.round(parseMoney(s));
}

function formatIntKo(n) {
  return Math.round(Number(n)).toLocaleString("ko-KR");
}

function recalc() {
  const sumEl = document.getElementById("items-sum-display");
  const totalEl = document.getElementById("total-display");
  const diffEl = document.getElementById("diff-display");
  const totalInput = document.getElementById("totalAmount");
  if (!sumEl || !totalEl || !diffEl || !totalInput) return;

  let sum = 0;
  document.querySelectorAll("tr[data-item-row] .js-amount").forEach((inp) => {
    sum += parseAllocatedInt(inp.value);
  });
  const total = parseMoney(totalInput.value);
  sumEl.textContent = formatIntKo(sum);
  totalEl.textContent = total.toFixed(2);
  diffEl.textContent = (total - sum).toFixed(2);
}

function buildPayload() {
  return [...document.querySelectorAll("tr[data-item-row]")].map((tr, idx) => ({
    id: tr.dataset.id || "",
    path: tr.querySelector(".js-path")?.value?.trim() ?? "",
    amount: tr.querySelector(".js-amount")?.value ?? "0",
    sortOrder: Number(tr.querySelector(".js-sort")?.value ?? idx),
  }));
}

document.getElementById("budget-form")?.addEventListener("submit", () => {
  const hidden = document.getElementById("itemsJson");
  if (hidden) hidden.value = JSON.stringify(buildPayload());
});

document.getElementById("item-rows")?.addEventListener("input", (e) => {
  if (e.target.classList?.contains("js-amount")) recalc();
});

/** 배정액 칸: 편집 시 콤마 제거, 마칠 때 천 단위 표시 */
document.getElementById("item-rows")?.addEventListener("focusin", (e) => {
  const inp = e.target;
  if (!inp.classList?.contains("js-amount")) return;
  inp.value = String(parseAllocatedInt(inp.value));
});

document.getElementById("item-rows")?.addEventListener("focusout", (e) => {
  const inp = e.target;
  if (!inp.classList?.contains("js-amount")) return;
  inp.value = formatIntKo(parseAllocatedInt(inp.value));
  recalc();
});
document.getElementById("totalAmount")?.addEventListener("input", recalc);

document.getElementById("btn-add-row")?.addEventListener("click", () => {
  const tbody = document.getElementById("item-rows");
  if (!tbody) return;
  const tr = document.createElement("tr");
  tr.setAttribute("data-item-row", "");
  tr.dataset.id = "";
  tr.innerHTML = `
    <td class="outline-cell">—</td>
    <td><input class="js-path" type="text" maxlength="2000" required autocomplete="off" /></td>
    <td><input class="js-amount" type="text" value="0" /></td>
    <td><input class="js-sort" type="number" value="0" /></td>
  `;
  tbody.appendChild(tr);
});

recalc();
