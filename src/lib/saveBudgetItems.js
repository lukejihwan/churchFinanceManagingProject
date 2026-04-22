import { assertNoParentCycle, assertParentSameBudget } from "./budgetItemHierarchy.js";
import {
  buildBudgetItemPathLookup,
  formatBudgetItemPath,
  parseBudgetItemPathSegments,
} from "./budgetItemPath.js";

/** 총 예산(원, 정수). 콤마 제거 후 반올림. */
export function parseTotalAmountBigInt(v) {
  const raw = typeof v === "string" ? v.trim().replace(/,/g, "") : String(v ?? "0");
  const n = parseFloat(raw.length ? raw : "0");
  if (!Number.isFinite(n)) return 0n;
  return BigInt(Math.round(n));
}

/** 배정액(원, 정수). 소수 입력은 반올림합니다. */
function toAllocatedInt(v) {
  const raw = typeof v === "string" ? v.trim().replace(/,/g, "") : String(v ?? "0");
  const n = parseFloat(raw.length ? raw : "0");
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

/**
 * 신규 UI(path) 또는 배포 직후 구형 폼(parentName + name)에서 경로 문자열을 만듭니다.
 * @param {{ path?: unknown, name?: unknown, parentName?: unknown }} r
 */
function rowPathString(r) {
  const direct = r.path != null ? String(r.path).trim() : "";
  if (direct) return direct;
  const legacyName = String(r.name ?? "").trim();
  const legacyParentRaw = String(r.parentName ?? "").trim();
  const legacyParent =
    legacyParentRaw && legacyParentRaw !== "(최상위)" ? legacyParentRaw : "";
  if (legacyParent && legacyName) {
    return `${legacyParent}/${legacyName}`;
  }
  return legacyName;
}

/**
 * @param {import('../generated/prisma/index.js').Prisma.TransactionClient} tx
 * @param {bigint} budgetId
 * @returns {Promise<Map<string, bigint>>}
 */
async function loadPathToIdMap(tx, budgetId) {
  const items = await tx.budgetItem.findMany({
    where: { budgetId },
    select: { id: true, parentId: true, name: true },
  });
  const pathFor = buildBudgetItemPathLookup(items);
  const m = new Map();
  for (const it of items) {
    m.set(pathFor(it.id), it.id);
  }
  return m;
}

/**
 * 상위 경로 세그먼트에 해당하는 노드들이 없으면 배정액 0으로 생성합니다.
 * @param {import('../generated/prisma/index.js').Prisma.TransactionClient} tx
 * @param {bigint} budgetId
 * @param {string[]} parentSegments
 * @param {Map<string, bigint>} pathToId
 */
async function ensureParentChain(tx, budgetId, parentSegments, pathToId) {
  let parentId = null;
  if (parentSegments.length === 0) {
    return null;
  }
  const cur = [];
  for (let i = 0; i < parentSegments.length; i++) {
    cur.push(parentSegments[i]);
    const key = formatBudgetItemPath(cur);
    let nodeId = pathToId.get(key);
    if (nodeId == null) {
      const created = await tx.budgetItem.create({
        data: {
          budgetId,
          parentId,
          name: parentSegments[i].slice(0, 150),
          code: null,
          allocatedAmount: 0,
          sortOrder: 0,
          isActive: true,
        },
      });
      nodeId = created.id;
      pathToId.set(key, nodeId);
    }
    parentId = nodeId;
  }
  return parentId;
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
 *   path?: string,
 *   name?: string,
 *   parentName?: string,
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

  /** @type {Array<{ raw: typeof rows[0], segments: string[], sortOrder: number, idx: number }>} */
  const parsed = [];
  const seenPaths = new Set();

  for (let idx = 0; idx < rows.length; idx++) {
    const raw = rows[idx];
    const pathStr = rowPathString(raw);
    const segments = parseBudgetItemPathSegments(pathStr);
    const fullPath = formatBudgetItemPath(segments);
    if (seenPaths.has(fullPath)) {
      throw new Error(`동일한 항목 경로가 두 번 이상 있습니다: ${fullPath}`);
    }
    seenPaths.add(fullPath);
    const sortOrder = Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : 0;
    parsed.push({ raw, segments, sortOrder, idx });
  }

  parsed.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.idx - b.idx;
  });

  return prisma.$transaction(async (tx) => {
    await tx.budget.update({
      where: { id: budgetId },
      data: {
        title: title.trim(),
        totalAmount: parseTotalAmountBigInt(totalAmount),
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

    let pathToId = await loadPathToIdMap(tx, budgetId);

    let knownIds = new Set(
      (await tx.budgetItem.findMany({ where: { budgetId }, select: { id: true } })).map((x) => x.id),
    );

    for (const { raw, segments } of parsed) {
      const leafName = segments[segments.length - 1];
      const parentSegments = segments.slice(0, -1);

      const parentId = await ensureParentChain(tx, budgetId, parentSegments, pathToId);

      const idStr = raw.id != null ? String(raw.id).trim() : "";
      let isUpdate = false;
      if (idStr !== "") {
        try {
          isUpdate = knownIds.has(BigInt(idStr));
        } catch {
          isUpdate = false;
        }
      }

      if (isUpdate) {
        const id = BigInt(idStr);
        if (parentId != null) {
          const parent = await tx.budgetItem.findFirst({
            where: { id: parentId, budgetId },
          });
          if (!parent) throw new Error("상위 예산 항목을 찾을 수 없습니다.");
          assertParentSameBudget(parent, budgetId);
        }
        await assertNoParentCycle(id, parentId, (pid) =>
          tx.budgetItem.findFirst({
            where: { id: pid, budgetId },
            select: { id: true, parentId: true },
          }),
        );
        await tx.budgetItem.update({
          where: { id },
          data: {
            name: leafName.slice(0, 150),
            code: null,
            allocatedAmount: toAllocatedInt(raw.amount),
            sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : 0,
            parentId,
          },
        });
      } else {
        if (parentId != null) {
          const parent = await tx.budgetItem.findFirst({
            where: { id: parentId, budgetId },
          });
          if (!parent) throw new Error("상위 예산 항목을 찾을 수 없습니다.");
          assertParentSameBudget(parent, budgetId);
        }
        await tx.budgetItem.create({
          data: {
            budgetId,
            parentId,
            name: leafName.slice(0, 150),
            code: null,
            allocatedAmount: toAllocatedInt(raw.amount),
            sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : 0,
            isActive: true,
          },
        });
      }

      pathToId = await loadPathToIdMap(tx, budgetId);
      knownIds = new Set(
        (await tx.budgetItem.findMany({ where: { budgetId }, select: { id: true } })).map((x) => x.id),
      );
    }
  });
}
