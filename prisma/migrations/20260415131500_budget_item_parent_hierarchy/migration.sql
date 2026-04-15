-- BudgetItem hierarchy: nullable parent_id (self-FK).
-- Uniqueness uses partial unique indexes (PostgreSQL) so NULL parent_id roots behave correctly
-- and nullable code can appear on multiple rows when code IS NULL.

-- DropIndex
DROP INDEX IF EXISTS "budget_items_budget_id_name_key";
DROP INDEX IF EXISTS "budget_items_budget_id_code_key";

-- AlterTable
ALTER TABLE "budget_items" ADD COLUMN "parent_id" BIGINT;

-- CreateIndex
CREATE INDEX "budget_items_budget_id_parent_id_idx" ON "budget_items"("budget_id", "parent_id");

-- AddForeignKey
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "budget_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Unique name: one root name per budget
CREATE UNIQUE INDEX "budget_items_budget_id_name_parent_root_key" ON "budget_items" ("budget_id", "name") WHERE "parent_id" IS NULL;

-- Unique name: sibling names unique under same parent
CREATE UNIQUE INDEX "budget_items_budget_id_parent_id_name_child_key" ON "budget_items" ("budget_id", "parent_id", "name") WHERE "parent_id" IS NOT NULL;

-- Unique non-null code: one per budget among roots
CREATE UNIQUE INDEX "budget_items_budget_id_code_parent_root_key" ON "budget_items" ("budget_id", "code") WHERE "parent_id" IS NULL AND "code" IS NOT NULL;

-- Unique non-null code: sibling codes unique under same parent
CREATE UNIQUE INDEX "budget_items_budget_id_parent_id_code_child_key" ON "budget_items" ("budget_id", "parent_id", "code") WHERE "parent_id" IS NOT NULL AND "code" IS NOT NULL;
