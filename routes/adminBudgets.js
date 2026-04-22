import express from "express";
import createError from "http-errors";
import { prisma } from "../src/config/db.js";
import { flatBudgetItemsWithSubmittedClaimRollup } from "../src/lib/budgetClaimRollup.js";
import { parseTotalAmountBigInt, saveBudgetWithItems } from "../src/lib/saveBudgetItems.js";

const router = express.Router();

function sumAllocated(items) {
  return items.reduce((acc, it) => acc + Number(it.allocatedAmount), 0);
}

/** 예산 배정액·합계 표시용 천 단위 구분 (ko-KR) */
function formatIntKo(n) {
  return Number(n).toLocaleString("ko-KR");
}

router.get("/new", async (req, res, next) => {
  let fiscalYearId;
  try {
    fiscalYearId = BigInt(String(req.query.fiscalYearId ?? ""));
  } catch {
    return next(createError(400, "fiscalYearId가 필요합니다."));
  }
  try {
    const fy = await prisma.fiscalYear.findUnique({ where: { id: fiscalYearId } });
    if (!fy) return next(createError(404));
    const existing = await prisma.budget.findUnique({ where: { fiscalYearId } });
    if (existing) return res.redirect(`/admin/budgets/${existing.id}/edit`);
    if (fy.isClosed) {
      return res.status(400).send("마감된 회계연도에는 예산안을 만들 수 없습니다.");
    }
    res.render("admin/budgets/new", {
      title: "예산안 만들기",
      fiscalYear: fy,
      errors: {},
      values: { title: `${fy.year}년 예산`, totalAmount: "0", description: "" },
    });
  } catch (e) {
    next(e);
  }
});

router.post("/", async (req, res, next) => {
  let fiscalYearId;
  try {
    fiscalYearId = BigInt(String(req.body.fiscalYearId ?? ""));
  } catch {
    return next(createError(400));
  }
  const title = String(req.body.title ?? "").trim();
  const totalAmount = String(req.body.totalAmount ?? "0");
  const description = String(req.body.description ?? "").trim() || null;

  if (!title) {
    const fy = await prisma.fiscalYear.findUnique({ where: { id: fiscalYearId } });
    if (!fy) return next(createError(404));
    return res.status(400).render("admin/budgets/new", {
      title: "예산안 만들기",
      fiscalYear: fy,
      errors: { title: "제목을 입력하세요." },
      values: { title: "", totalAmount, description: description ?? "" },
    });
  }

  try {
    const fy = await prisma.fiscalYear.findUnique({ where: { id: fiscalYearId } });
    if (!fy) return next(createError(404));
    if (fy.isClosed) return res.status(400).send("마감된 회계연도입니다.");
    const budget = await prisma.budget.create({
      data: {
        fiscalYearId,
        title,
        totalAmount: parseTotalAmountBigInt(totalAmount),
        description,
        createdById: res.locals.currentUser?.id ?? null,
      },
    });
    return res.redirect(`/admin/budgets/${budget.id}/edit`);
  } catch (e) {
    if (e.code === "P2002") {
      const fy = await prisma.fiscalYear.findUnique({ where: { id: fiscalYearId } });
      if (!fy) return next(createError(404));
      return res.status(409).render("admin/budgets/new", {
        title: "예산안 만들기",
        fiscalYear: fy,
        errors: { form: "이 회계연도에 이미 예산안이 있습니다." },
        values: { title, totalAmount, description: description ?? "" },
      });
    }
    return next(e);
  }
});

router.get("/:id/edit", async (req, res, next) => {
  let id;
  try {
    id = BigInt(req.params.id);
  } catch {
    return next(createError(404));
  }
  try {
    const budget = await prisma.budget.findUnique({
      where: { id },
      include: {
        fiscalYear: true,
        items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      },
    });
    if (!budget) return next(createError(404));
    const flat = await flatBudgetItemsWithSubmittedClaimRollup(prisma, budget.fiscalYearId, budget.items);
    const itemsSum = sumAllocated(budget.items);
    const itemsSumStr = formatIntKo(itemsSum);
    const totalStr = formatIntKo(budget.totalAmount);
    const diffStr = formatIntKo(Number(budget.totalAmount) - itemsSum);
    res.render("admin/budgets/edit", {
      title: "예산 편집",
      budget,
      fiscalYear: budget.fiscalYear,
      flatItems: flat,
      itemsSumStr,
      totalStr,
      diffStr,
      saveError: null,
      saved: req.query.saved === "1",
    });
  } catch (e) {
    next(e);
  }
});

router.post("/:id/edit", async (req, res, next) => {
  let id;
  try {
    id = BigInt(req.params.id);
  } catch {
    return next(createError(404));
  }

  let itemsPayload = [];
  try {
    itemsPayload = JSON.parse(String(req.body.itemsJson ?? "[]"));
  } catch {
    itemsPayload = [];
  }

  const title = String(req.body.title ?? "").trim();
  const totalAmount = String(req.body.totalAmount ?? "0");
  const description = String(req.body.description ?? "").trim() || null;

  try {
    const budget = await prisma.budget.findUnique({
      where: { id },
      include: { fiscalYear: true, items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
    });
    if (!budget) return next(createError(404));
    if (budget.fiscalYear.isClosed) {
      return res.status(400).send("마감된 회계연도의 예산은 수정할 수 없습니다.");
    }

    if (!title) {
      const flat = await flatBudgetItemsWithSubmittedClaimRollup(prisma, budget.fiscalYearId, budget.items);
      const itemsSum = sumAllocated(budget.items);
      return res.status(400).render("admin/budgets/edit", {
        title: "예산 편집",
        budget: { ...budget, title, totalAmount: parseTotalAmountBigInt(totalAmount), description },
        fiscalYear: budget.fiscalYear,
        flatItems: flat,
        itemsSumStr: formatIntKo(itemsSum),
        totalStr: formatIntKo(parseTotalAmountBigInt(totalAmount)),
        diffStr: formatIntKo(Number(parseTotalAmountBigInt(totalAmount)) - itemsSum),
        saveError: "제목을 입력하세요.",
        saved: false,
      });
    }

    await saveBudgetWithItems(prisma, {
      budgetId: id,
      title,
      totalAmount,
      description,
      itemsPayload,
    });

    return res.redirect(`/admin/budgets/${id}/edit?saved=1`);
  } catch (e) {
    try {
      const budget = await prisma.budget.findUnique({
        where: { id },
        include: { fiscalYear: true, items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
      });
      if (!budget) return next(e);
      const flat = await flatBudgetItemsWithSubmittedClaimRollup(prisma, budget.fiscalYearId, budget.items);
      const itemsSum = sumAllocated(budget.items);
      return res.status(400).render("admin/budgets/edit", {
        title: "예산 편집",
        budget,
        fiscalYear: budget.fiscalYear,
        flatItems: flat,
        itemsSumStr: formatIntKo(itemsSum),
        totalStr: formatIntKo(budget.totalAmount),
        diffStr: formatIntKo(Number(budget.totalAmount) - itemsSum),
        saveError: e.message || "저장에 실패했습니다.",
        saved: false,
      });
    } catch {
      return next(e);
    }
  }
});

export default router;
