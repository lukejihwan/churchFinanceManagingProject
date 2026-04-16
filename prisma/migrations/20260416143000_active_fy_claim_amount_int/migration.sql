-- AlterTable
ALTER TABLE "fiscal_years" ADD COLUMN "is_active_for_claims" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: 청구 금액을 정수(원 단위)로 저장
ALTER TABLE "claims" ALTER COLUMN "claim_amount" TYPE INTEGER USING (ROUND("claim_amount"))::INTEGER;

-- 기본값: 신규 청구는 제출 상태로 생성
ALTER TABLE "claims" ALTER COLUMN "status" SET DEFAULT 'SUBMITTED';
