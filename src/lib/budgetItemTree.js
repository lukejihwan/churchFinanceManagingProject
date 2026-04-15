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
