-- One budget document per fiscal year.
CREATE UNIQUE INDEX "budgets_fiscal_year_id_key" ON "budgets"("fiscal_year_id");
