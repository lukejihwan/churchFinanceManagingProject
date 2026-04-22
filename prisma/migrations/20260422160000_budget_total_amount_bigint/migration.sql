-- AlterColumn: 총 예산을 DECIMAL에서 BIGINT(int8)로 통일 (원 단위 정수)
ALTER TABLE "budgets" ALTER COLUMN "total_amount" TYPE BIGINT USING ROUND("total_amount")::bigint;
