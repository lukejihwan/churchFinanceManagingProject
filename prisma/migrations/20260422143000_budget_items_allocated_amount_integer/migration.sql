-- AlterColumn: 배정액을 정수(원 단위)로 저장합니다. 기존 소수 값은 반올림합니다.
ALTER TABLE "budget_items" ALTER COLUMN "allocated_amount" SET DATA TYPE INTEGER USING ROUND("allocated_amount")::INTEGER;
