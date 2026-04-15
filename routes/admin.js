import express from "express";
import { requireAdmin } from "../src/middleware/requireAuth.js";
import adminUsersRouter from "./adminUsers.js";
import adminFiscalYearsRouter from "./adminFiscalYears.js";
import adminBudgetsRouter from "./adminBudgets.js";

const router = express.Router();

router.use(requireAdmin);
router.use("/users", adminUsersRouter);
router.use("/fiscal-years", adminFiscalYearsRouter);
router.use("/budgets", adminBudgetsRouter);

export default router;
