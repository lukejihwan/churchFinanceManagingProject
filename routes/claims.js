import express from "express";
import createError from "http-errors";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { prisma } from "../src/config/db.js";
import { flattenBudgetItemsForSelect } from "../src/lib/budgetItemTree.js";
import { requireClaimant, requireLogin } from "../src/middleware/requireAuth.js";
import { ClaimStatus } from "../src/generated/prisma/index.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_ROOT = path.join(__dirname, "..", "uploads", "claims");

const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

function ensureUploadDir() {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

function todayUtcDateOnly() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function extForMime(mime) {
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/gif") return ".gif";
  if (mime === "image/webp") return ".webp";
  return "";
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    try {
      ensureUploadDir();
      cb(null, UPLOAD_ROOT);
    } catch (e) {
      cb(e);
    }
  },
  filename(_req, file, cb) {
    const ext = extForMime(file.mimetype) || path.extname(file.originalname || "").toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  if (IMAGE_MIMES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("이미지 파일만 업로드할 수 있습니다."));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024, files: 20 },
});

async function loadClaimFormContext() {
  const activeFy = await prisma.fiscalYear.findFirst({
    where: { isActiveForClaims: true },
    include: {
      budgets: {
        take: 1,
        include: {
          items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
        },
      },
    },
  });

  if (!activeFy) {
    return { activeFy: null, budgetItemOptions: [] };
  }

  const budget = activeFy.budgets[0];
  const items = budget?.items ?? [];
  const budgetItemOptions = flattenBudgetItemsForSelect(items);

  return { activeFy, budgetItemOptions };
}

router.get("/claims/new", requireLogin, requireClaimant, async (req, res, next) => {
  try {
    const { activeFy, budgetItemOptions } = await loadClaimFormContext();
    res.render("claims/new", {
      title: "청구",
      activeFy,
      budgetItemOptions,
      errors: {},
      values: { title: "", claimAmount: "", description: "", budgetItemId: "" },
      submittedOk: req.query.ok === "1",
    });
  } catch (e) {
    next(e);
  }
});

router.post(
  "/claims",
  requireLogin,
  requireClaimant,
  (req, res, next) => {
    upload.array("receipts", 20)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return next(createError(400, err.message));
      }
      if (err) {
        return next(createError(400, err.message || "파일 업로드 오류"));
      }
      next();
    });
  },
  async (req, res, next) => {
    const budgetItemIdStr = String(req.body.budgetItemId ?? "").trim();
    const errors = {};
    /** @type {bigint | null} */
    let budgetItemId = null;
    if (!budgetItemIdStr) {
      errors.budgetItemId = "예산 항목을 선택하세요.";
    } else {
      try {
        budgetItemId = BigInt(budgetItemIdStr);
      } catch {
        errors.budgetItemId = "예산 항목이 올바르지 않습니다.";
      }
    }

    const title = String(req.body.title ?? "").trim() || "청구";
    const description = String(req.body.description ?? "").trim() || null;
    const claimAmountRaw = String(req.body.claimAmount ?? "").trim();
    const claimAmount = Number.parseInt(claimAmountRaw, 10);
    if (!Number.isFinite(claimAmount) || claimAmount <= 0) {
      errors.claimAmount = "청구 금액은 1원 이상의 정수로 입력하세요.";
    }
    if (claimAmount > 2147483647) {
      errors.claimAmount = "청구 금액이 너무 큽니다.";
    }

    const files = req.files;
    if (!Array.isArray(files) || files.length === 0) {
      errors.receipts = "영수증 이미지를 1장 이상 첨부하세요.";
    }

    const ctx = await loadClaimFormContext();
    if (!ctx.activeFy) {
      return res.status(400).render("claims/new", {
        title: "청구",
        activeFy: null,
        budgetItemOptions: [],
        errors: { _form: "활성 회계연도가 없습니다. 관리자에게 문의하세요." },
        values: {
          title,
          claimAmount: claimAmountRaw,
          description: description ?? "",
          budgetItemId: budgetItemIdStr,
        },
        submittedOk: false,
      });
    }

    if (budgetItemId != null && !errors.budgetItemId) {
      const itemRow = await prisma.budgetItem.findFirst({
        where: {
          id: budgetItemId,
          budget: { fiscalYearId: ctx.activeFy.id },
        },
        select: { id: true },
      });
      if (!itemRow) {
        errors.budgetItemId = "선택한 예산 항목이 활성 회계연도 예산에 없습니다.";
      }
    }

    if (Object.keys(errors).length > 0) {
      for (const f of files || []) {
        try {
          fs.unlinkSync(f.path);
        } catch {
          /* ignore */
        }
      }
      return res.status(400).render("claims/new", {
        title: "청구",
        activeFy: ctx.activeFy,
        budgetItemOptions: ctx.budgetItemOptions,
        errors,
        values: {
          title,
          claimAmount: claimAmountRaw,
          description: description ?? "",
          budgetItemId: budgetItemIdStr,
        },
        submittedOk: false,
      });
    }

    const claimNo = `CLM-${crypto.randomUUID()}`;

    try {
      await prisma.$transaction(async (tx) => {
        const claim = await tx.claim.create({
          data: {
            claimNo,
            userId: res.locals.currentUser.id,
            budgetItemId,
            fiscalYearId: ctx.activeFy.id,
            claimAmount,
            claimDate: todayUtcDateOnly(),
            title: title.slice(0, 150),
            description,
            status: ClaimStatus.SUBMITTED,
          },
        });

        for (const f of files) {
          const relPath = path.join("claims", f.filename);
          await tx.claimAttachment.create({
            data: {
              claimId: claim.id,
              filePath: relPath,
              originalName: (f.originalname || "receipt").slice(0, 255),
              mimeType: f.mimetype || null,
              fileSize: BigInt(f.size),
            },
          });
        }
      });
    } catch (e) {
      for (const f of files || []) {
        try {
          fs.unlinkSync(f.path);
        } catch {
          /* ignore */
        }
      }
      return next(e);
    }

    return res.redirect("/claims/new?ok=1");
  },
);

export default router;
