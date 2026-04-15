import { Prisma } from "../generated/prisma/index.js";
import { assertNoParentCycle, assertParentSameBudget } from "./budgetItemHierarchy.js";

function toDecimal(v) {
  const s = typeof v === "string" ? v.trim() : String(v ?? "0");
  return new Prisma.Decimal(s.length ? s : "0");
}

function normalizeParentName(v) {
  const s = v == null ? "" : String(v).trim();
  if (!s || s === "(최상위)") return null;
  return s;
}

function assertDistinctItemNames(rows) {
  const seen = new Set();
  for (const r of rows) {
    const n = String(r.name ?? "").trim();
    if (!n) throw new Error("항목명을 입력하세요.");
    if (seen.has(n)) throw new Error(`같은 예산에 동일한 항목명이 둘 이상입니다: ${n}`);
    seen.add(n);
  }
}

/** @param {Map<string, bigint>} nameToId */
function resolveParentId(r, nameToId, selfId) {
  const label = normalizeParentName(r.parentName);
  if (label == null) return null;
  const pid = nameToId.get(label);
  if (pid === undefined) throw new Error(`부모 항목명을 찾을 수 없습니다: ${label}`);
  if (selfId != null && pid === selfId) throw new Error("항목 자기 자신을 부모로 지정할 수 없습니다.");
  return pid;
}

async function deleteRemovedItems(tx, budgetId, toDeleteIds) {
  let ids = [...toDeleteIds];
  while (ids.length > 0) {
    const batch = await tx.budgetItem.findMany({
      where: { budgetId, id: { in: ids } },
      select: {
        id: true,
        _count: { select: { children: true } },
      },
    });
    const leaves = batch.filter((b) => b._count.children === 0).map((b) => b.id);
    if (leaves.length === 0) break;
    for (const id of leaves) {
      const cnt = await tx.claim.count({ where: { budgetItemId: id } });
      if (cnt > 0) {
        ids = ids.filter((i) => i !== id);
        continue;
      }
      await tx.budgetItem.delete({ where: { id } });
      ids = ids.filter((i) => i !== id);
    }
  }
}

/**
 * @param {import('../generated/prisma/index.js').PrismaClient} prisma
 * @param {object} opts
 * @param {bigint} opts.budgetId
 * @param {string} opts.title
 * @param {string|number} opts.totalAmount
 * @param {string | null | undefined} opts.description
 * @param {Array<{
 *   id?: string,
 *   parentName?: string,
 *   name: string,
 *   amount: string | number,
 *   sortOrder?: number
 * }>} opts.itemsPayload
 */
export async function saveBudgetWithItems(prisma, opts) {
  const { budgetId, title, totalAmount, description, itemsPayload } = opts;

  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    select: { id: true, fiscalYearId: true },
  });
  if (!budget) throw new Error("예산안을 찾을 수 없습니다.");

  const rows = Array.isArray(itemsPayload) ? itemsPayload : [];
  assertDistinctItemNames(rows);

  return prisma.$transaction(async (tx) => {
    await tx.budget.update({
      where: { id: budgetId },
      data: {
        title: title.trim(),
        totalAmount: toDecimal(totalAmount),
        description: description?.trim() || null,
      },
    });

    const existing = await tx.budgetItem.findMany({
      where: { budgetId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((e) => e.id));

    const payloadIds = new Set();
    for (const r of rows) {
      if (!r.id || String(r.id).trim() === "") continue;
      try {
        const id = BigInt(r.id);
        if (existingIds.has(id)) payloadIds.add(id);
      } catch {
        /* skip invalid id */
      }
    }

    const toDelete = [...existingIds].filter((id) => !payloadIds.has(id));
    await deleteRemovedItems(tx, budgetId, toDelete);

    let knownIds = new Set(
      (await tx.budgetItem.findMany({ where: { budgetId }, select: { id: true } })).map((x) => x.id),
    );

    const updates = rows.filter((r) => {
      if (!r.id || String(r.id).trim() === "") return false;
      try {
        return knownIds.has(BigInt(r.id));
      } catch {
        return false;
      }
    });

    /** 이름(트림) → 항목 id — 페이로드에 id가 있는 행만 먼저 등록, 생성 후 신규 행도 추가 */
    const nameToId = new Map();
    for (const r of rows) {
      if (!r.id || String(r.id).trim() === "") continue;
      nameToId.set(String(r.name).trim(), BigInt(r.id));
    }

    for (const r of updates) {
      const id = BigInt(r.id);
      const parentId = resolveParentId(r, nameToId, id);
      if (parentId != null) {
        const parent = await tx.budgetItem.findFirst({
          where: { id: parentId, budgetId },
        });
        if (!parent) throw new Error("부모 항목을 찾을 수 없습니다.");
        assertParentSameBudget(parent, budgetId);
        await assertNoParentCycle(id, parentId, (pid) =>
          tx.budgetItem.findFirst({
            where: { id: pid, budgetId },
            select: { id: true, parentId: true },
          }),
        );
      }
      await tx.budgetItem.update({
        where: { id },
        data: {
          name: String(r.name).trim().slice(0, 150),
          code: null,
          allocatedAmount: toDecimal(r.amount),
          sortOrder: Number.isFinite(Number(r.sortOrder)) ? Number(r.sortOrder) : 0,
          parentId,
        },
      });
    }

    knownIds = new Set(
      (await tx.budgetItem.findMany({ where: { budgetId }, select: { id: true } })).map((x) => x.id),
    );

    const creates = rows.filter((r) => !r.id || String(r.id).trim() === "");
    let pending = [...creates];

    while (pending.length > 0) {
      const round = [];
      const rest = [];
      for (const r of pending) {
        const label = normalizeParentName(r.parentName);
        let parentId = null;
        let ok = true;
        if (label != null) {
          const pid = nameToId.get(label);
          if (pid === undefined) {
            ok = false;
          } else {
            parentId = pid;
          }
        }
        if (ok && (parentId == null || knownIds.has(parentId))) {
          round.push({ ...r, parentId });
        } else {
          rest.push(r);
        }
      }
      if (round.length === 0) {
        throw new Error(
          "새 항목의 부모가 아직 저장되지 않았거나 잘못된 부모를 참조합니다. 부모 항목명을 확인하고, 표에서 부모 행이 자식보다 위에 오도록 순서를 맞춘 뒤 다시 시도하세요.",
        );
      }
      for (const r of round) {
        const parentId = r.parentId;
        if (parentId != null) {
          const parent = await tx.budgetItem.findFirst({ where: { id: parentId, budgetId } });
          if (!parent) throw new Error("부모 항목을 찾을 수 없습니다.");
          assertParentSameBudget(parent, budgetId);
        }
        const created = await tx.budgetItem.create({
          data: {
            budgetId,
            parentId,
            name: String(r.name).trim().slice(0, 150),
            code: null,
            allocatedAmount: toDecimal(r.amount),
            sortOrder: Number.isFinite(Number(r.sortOrder)) ? Number(r.sortOrder) : 0,
            isActive: true,
          },
        });
        knownIds.add(created.id);
        nameToId.set(String(r.name).trim(), created.id);
      }
      pending = rest;
    }
  });
}
