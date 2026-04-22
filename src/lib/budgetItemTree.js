import { buildBudgetItemPathLookup } from "./budgetItemPath.js";

/**
 * BudgetItem 목록을 부모-자식 순서로 평탄화해 편집 테이블에 씁니다.
 * 각 행에 path(루트부터 `/`로 이은 전체 경로), outlineNumber(1, 1-1, …)를 붙입니다.
 * @param {Array<{ id: bigint, parentId: bigint | null, sortOrder: number } & Record<string, unknown>>} items
 * @returns {Array<Record<string, unknown> & { path: string, outlineNumber: string }>}
 */
export function flattenBudgetItemsForEdit(items) {
  const pathFor = buildBudgetItemPathLookup(items);
  const byParent = new Map();
  for (const it of items) {
    const k = it.parentId == null ? "root" : String(it.parentId);
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k).push(it);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return Number(a.id - b.id);
    });
  }
  const out = [];
  /**
   * @param {string} parentKey
   * @param {string} parentOutline 빈 문자열이면 최상위 단계
   */
  function walk(parentKey, parentOutline) {
    const arr = byParent.get(parentKey) || [];
    arr.forEach((it, idx) => {
      const outlineNumber = parentOutline ? `${parentOutline}-${idx + 1}` : String(idx + 1);
      const path = pathFor(it.id);
      out.push({ ...it, path, outlineNumber });
      walk(String(it.id), outlineNumber);
    });
  }
  walk("root", "");
  return out;
}

/**
 * 예산 항목 선택용: 트리 순서·들여쓰기 라벨 (동일 항목명이 다른 상위에 있어도 경로로 구분)
 * @param {Array<{ id: bigint, parentId: bigint | null, sortOrder: number, name: string, code?: string | null }>} items
 * @returns {Array<{ id: bigint, label: string }>}
 */
export function flattenBudgetItemsForSelect(items) {
  const flat = flattenBudgetItemsForEdit(items);
  const idToDepth = new Map();
  for (const it of flat) {
    const d =
      it.parentId == null ? 0 : (idToDepth.get(String(it.parentId)) ?? 0) + 1;
    idToDepth.set(String(it.id), d);
  }
  return flat.map((it) => {
    const depth = idToDepth.get(String(it.id)) ?? 0;
    const prefix = "  ".repeat(depth);
    const codePart = it.code ? ` (${it.code})` : "";
    const labelPath = typeof it.path === "string" ? it.path : String(it.name ?? "");
    return { id: it.id, label: `${prefix}${labelPath}${codePart}` };
  });
}
