function parseMoney(s) {
  const n = parseFloat(String(s).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function recalc() {
  const sumEl = document.getElementById("items-sum-display");
  const totalEl = document.getElementById("total-display");
  const diffEl = document.getElementById("diff-display");
  const totalInput = document.getElementById("totalAmount");
  if (!sumEl || !totalEl || !diffEl || !totalInput) return;

  let sum = 0;
  document.querySelectorAll("tr[data-item-row] .js-amount").forEach((inp) => {
    sum += parseMoney(inp.value);
  });
  const total = parseMoney(totalInput.value);
  sumEl.textContent = sum.toFixed(2);
  totalEl.textContent = total.toFixed(2);
  diffEl.textContent = (total - sum).toFixed(2);
}

function buildPayload() {
  return [...document.querySelectorAll("tr[data-item-row]")].map((tr, idx) => ({
    id: tr.dataset.id || "",
    parentName: tr.querySelector(".js-parent-name")?.value?.trim() ?? "",
    name: tr.querySelector(".js-name")?.value ?? "",
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
document.getElementById("totalAmount")?.addEventListener("input", recalc);

document.getElementById("btn-add-row")?.addEventListener("click", () => {
  const tbody = document.getElementById("item-rows");
  if (!tbody) return;
  const tr = document.createElement("tr");
  tr.setAttribute("data-item-row", "");
  tr.dataset.id = "";
  tr.innerHTML = `
    <td>(신규)</td>
    <td><input class="js-parent-name" type="text" maxlength="150" placeholder="(최상위)" autocomplete="off" /></td>
    <td><input class="js-name" type="text" maxlength="150" required /></td>
    <td><input class="js-amount" type="text" value="0" /></td>
    <td><input class="js-sort" type="number" value="0" /></td>
  `;
  tbody.appendChild(tr);
});

recalc();
