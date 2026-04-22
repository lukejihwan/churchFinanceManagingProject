import { ClaimStatus } from "../generated/prisma/index.js";
import { flattenBudgetItemsForEdit } from "./budgetItemTree.js";

/**
 * 예산 항목별 직접 연결 청구(SUBMITTED만) 금액 합계를 트리로 롤업합니다.
 * 각 노드 값 = 해당 항목에 직접 매핑된 청구 합 + 모든 하위 항목 롤업 합.
 *
 * @param {import("../generated/prisma/index.js").PrismaClient} prisma
 * @param {bigint} fiscalYearId
 * @param {Array<{ id: bigint, parentId: bigint | null }>} items
 * @returns {Promise<Map<string, number>>}
 */
export async function computeRolledUpSubmittedClaimTotals(prisma, fiscalYearId, items) {
  const out = new Map();
  if (!items.length) return out;

  const itemIds = items.map((it) => it.id);
  const groups = await prisma.claim.groupBy({
    by: ["budgetItemId"],
    where: {
      fiscalYearId,
      status: ClaimStatus.SUBMITTED,
      budgetItemId: { in: itemIds },
    },
    _sum: { claimAmount: true },
  });

  /** @type {Map<string, number>} */
  const direct = new Map();
  for (const g of groups) {
    direct.set(String(g.budgetItemId), Number(g._sum.claimAmount ?? 0));
  }

  /** @type {Map<string, string[]>} */
  const childrenByParent = new Map();
  for (const it of items) {
    const pk = it.parentId == null ? "root" : String(it.parentId);
    if (!childrenByParent.has(pk)) childrenByParent.set(pk, []);
    childrenByParent.get(pk).push(String(it.id));
  }

  /** @type {Map<string, number>} */
  const memo = new Map();

  /**
   * @param {string} idStr
   */
  function totalFor(idStr) {
    if (memo.has(idStr)) return memo.get(idStr);
    let t = direct.get(idStr) ?? 0;
    for (const cid of childrenByParent.get(idStr) ?? []) {
      t += totalFor(cid);
    }
    memo.set(idStr, t);
    return t;
  }

  for (const it of items) {
    const idStr = String(it.id);
    out.set(idStr, totalFor(idStr));
  }

  return out;
}

/**
 * 편집 테이블용 평탄 목록에 항목별 롤업 청구 합계를 붙입니다.
 *
 * @param {import("../generated/prisma/index.js").PrismaClient} prisma
 * @param {bigint} fiscalYearId
 * @param {Array<{ id: bigint, parentId: bigint | null, sortOrder: number } & Record<string, unknown>>} items
 */
export async function flatBudgetItemsWithSubmittedClaimRollup(prisma, fiscalYearId, items) {
  const rollupMap = await computeRolledUpSubmittedClaimTotals(prisma, fiscalYearId, items);
  return flattenBudgetItemsForEdit(items).map((it) => ({
    ...it,
    totalClaimAmount: rollupMap.get(String(it.id)) ?? 0,
  }));
}
