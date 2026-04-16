import express from "express";
import createError from "http-errors";
import { prisma } from "../src/config/db.js";
const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const fiscalYears = await prisma.fiscalYear.findMany({
      orderBy: { year: "desc" },
      include: {
        budgets: { take: 1, select: { id: true, title: true } },
      },
    });
    const rows = fiscalYears.map((fy) => ({
      ...fy,
      budget: fy.budgets[0] ?? null,
    }));
    res.render("admin/fiscal-years/index", {
      title: "회계연도",
      fiscalYears: rows,
    });
  } catch (e) {
    next(e);
  }
});

router.get("/new", (req, res) => {
  res.render("admin/fiscal-years/form", {
    title: "회계연도 등록",
    errors: {},
    values: { year: "", name: "", startDate: "", endDate: "" },
  });
});

router.post("/", async (req, res, next) => {
  const year = Number.parseInt(String(req.body.year ?? ""), 10);
  const name = String(req.body.name ?? "").trim();
  const startDate = String(req.body.startDate ?? "").trim();
  const endDate = String(req.body.endDate ?? "").trim();
  const errors = {};
  if (!Number.isFinite(year) || year < 1900 || year > 2200) errors.year = "연도를 올바르게 입력하세요.";
  if (!name) errors.name = "이름을 입력하세요.";
  if (!startDate) errors.startDate = "시작일을 입력하세요.";
  if (!endDate) errors.endDate = "종료일을 입력하세요.";
  if (startDate && endDate && startDate > endDate) errors.endDate = "종료일은 시작일 이후여야 합니다.";

  if (Object.keys(errors).length > 0) {
    return res.status(400).render("admin/fiscal-years/form", {
      title: "회계연도 등록",
      errors,
      values: { year: String(req.body.year ?? ""), name, startDate, endDate },
    });
  }

  try {
    await prisma.fiscalYear.create({
      data: {
        year,
        name,
        startDate: new Date(`${startDate}T00:00:00.000Z`),
        endDate: new Date(`${endDate}T00:00:00.000Z`),
      },
    });
    return res.redirect("/admin/fiscal-years");
  } catch (e) {
    if (e.code === "P2002") {
      return res.status(409).render("admin/fiscal-years/form", {
        title: "회계연도 등록",
        errors: { year: "이미 등록된 연도입니다." },
        values: { year: String(req.body.year ?? ""), name, startDate, endDate },
      });
    }
    return next(e);
  }
});

router.post("/:id/activate-for-claims", async (req, res, next) => {
  let id;
  try {
    id = BigInt(req.params.id);
  } catch {
    return next(createError(404));
  }
  try {
    const fy = await prisma.fiscalYear.findUnique({ where: { id } });
    if (!fy) return next(createError(404));
    if (fy.isClosed) {
      return res
        .status(400)
        .send("마감된 회계연도는 청구용 활성 회계연도로 설정할 수 없습니다.");
    }
    await prisma.$transaction(async (tx) => {
      await tx.fiscalYear.updateMany({ data: { isActiveForClaims: false } });
      await tx.fiscalYear.update({
        where: { id },
        data: { isActiveForClaims: true },
      });
    });
    return res.redirect("/admin/fiscal-years");
  } catch (e) {
    next(e);
  }
});

router.get("/:id", async (req, res, next) => {
  let id;
  try {
    id = BigInt(req.params.id);
  } catch {
    return next(createError(404));
  }
  try {
    const fy = await prisma.fiscalYear.findUnique({
      where: { id },
      include: { budgets: { take: 1, select: { id: true } } },
    });
    if (!fy) return next(createError(404));
    const budget = fy.budgets[0];
    if (budget) return res.redirect(`/admin/budgets/${budget.id}/edit`);
    return res.redirect(`/admin/budgets/new?fiscalYearId=${fy.id}`);
  } catch (e) {
    next(e);
  }
});

export default router;
