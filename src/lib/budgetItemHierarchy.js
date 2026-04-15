/**
 * BudgetItem 트리(parentId)용 검증 헬퍼.
 * FK는 DB에서 막고, 동일 budget·순환은 앱에서 호출해 보강합니다.
 */

/**
 * 부모 행이 자식과 같은 예산에 속하는지 확인합니다.
 * @param {{ budgetId: bigint }} parent
 * @param {bigint} childBudgetId
 */
export function assertParentSameBudget(parent, childBudgetId) {
  if (String(parent.budgetId) !== String(childBudgetId)) {
    throw new Error("BudgetItem parent must belong to the same budget as the child.");
  }
}

/**
 * itemId를 조상으로 올리는 순환이 생기지 않는지 확인합니다.
 * @param {bigint} itemId
 * @param {bigint | null} newParentId
 * @param {(id: bigint) => Promise<{ id: bigint, parentId: bigint | null } | null>} loadRow
 */
export async function assertNoParentCycle(itemId, newParentId, loadRow) {
  let current = newParentId;
  const maxSteps = 10_000;
  let steps = 0;
  while (current != null) {
    if (String(current) === String(itemId)) {
      throw new Error("BudgetItem cannot be its own ancestor.");
    }
    const row = await loadRow(current);
    if (!row) break;
    current = row.parentId;
    if (++steps > maxSteps) {
      throw new Error("BudgetItem hierarchy too deep or cycle detected.");
    }
  }
}

/**
 * 스키마상 부모 삭제는 ON DELETE RESTRICT — 자식이 있으면 DB에서 거절됩니다.
 * 앱에서 미리 막으려면 자식 존재 여부를 조회하세요.
 */
export const parentDeleteBehavior = "RESTRICT";

/**
 * 청구를 리프에만 허용할 때 사용할 수 있는 판별기(자식이 없으면 리프).
 * @param {number} childCount
 */
export function isLeafByChildCount(childCount) {
  return childCount === 0;
}
