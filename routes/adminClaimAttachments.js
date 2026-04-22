import express from "express";
import createError from "http-errors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../src/config/db.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_ROOT = path.join(__dirname, "..", "uploads");

router.get("/claim-attachments/:id", async (req, res, next) => {
  let attachmentId;
  try {
    attachmentId = BigInt(req.params.id);
  } catch {
    return next(createError(404));
  }
  try {
    const row = await prisma.claimAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        filePath: true,
        mimeType: true,
        claim: { select: { id: true } },
      },
    });
    if (!row) return next(createError(404));

    const abs = path.resolve(UPLOAD_ROOT, row.filePath);
    const rootResolved = path.resolve(UPLOAD_ROOT);
    if (!abs.startsWith(rootResolved + path.sep) && abs !== rootResolved) {
      return next(createError(404));
    }
    if (!fs.existsSync(abs)) return next(createError(404));

    if (row.mimeType) res.type(row.mimeType);
    return res.sendFile(abs);
  } catch (e) {
    next(e);
  }
});

export default router;
