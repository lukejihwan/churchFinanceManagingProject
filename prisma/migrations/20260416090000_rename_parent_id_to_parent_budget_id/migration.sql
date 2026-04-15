-- Rename parent FK column to sit next to budget_id in naming; physical column order in PG unchanged by RENAME.

ALTER TABLE "budget_items" RENAME COLUMN "parent_id" TO "parent_budget_id";

ALTER INDEX "budget_items_budget_id_parent_id_idx" RENAME TO "budget_items_budget_id_parent_budget_id_idx";

ALTER TABLE "budget_items" RENAME CONSTRAINT "budget_items_parent_id_fkey" TO "budget_items_parent_budget_id_fkey";
