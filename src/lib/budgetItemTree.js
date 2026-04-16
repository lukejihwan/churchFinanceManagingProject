/**
 * BudgetItem 목록을 부모-자식 순서로 평탄화해 편집 테이블에 씁니다.
 * 각 행에 parentName(부모 항목명, 최상위면 빈 문자열)을 붙입니다.
 * @param {Array<{ id: bigint, parentId: bigint | null, sortOrder: number } & Record<string, unknown>>} items
 * @returns {Array<Record<string, unknown> & { parentName: string }>}
 */
export function flattenBudgetItemsForEdit(items) {
  const idToName = new Map(items.map((it) => [String(it.id), String(it.name ?? "")]));
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
  function walk(parentKey) {
    const arr = byParent.get(parentKey) || [];
    for (const it of arr) {
      const parentName =
        it.parentId == null ? "" : (idToName.get(String(it.parentId)) ?? "");
      out.push({ ...it, parentName });
      walk(String(it.id));
    }
  }
  walk("root");
  return out;
}

/**
 * 예산 항목 선택용: 트리 순서·들여쓰기 라벨
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
    return { id: it.id, label: `${prefix}${it.name}${codePart}` };
  });
}
