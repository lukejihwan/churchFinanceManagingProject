/** 청구번호: `{회계연도}-{접두어}-{순번}` (예: 2026-sisimna-1) */

const MIDDLE_DEFAULT = "sisimna";

/**
 * 중간 토큰. `CLAIM_NO_MIDDLE` 환경 변수로 덮어쓸 수 있음 (영소문자·숫자만).
 */
export function claimNoMiddleSegment() {
  const raw = process.env.CLAIM_NO_MIDDLE?.trim().toLowerCase();
  if (!raw || !/^[a-z0-9]+$/.test(raw)) return MIDDLE_DEFAULT;
  return raw.length > 24 ? raw.slice(0, 24) : raw;
}

/**
 * 동일 회계연도에서 다음 순번 청구번호를 부여합니다.
 * 트랜잭션 내에서 호출합니다 (내부에서 회계연도별 advisory lock 사용).
 * @param {*} tx Prisma 트랜잭션 클라이언트
 * @param {bigint} fiscalYearId
 * @param {{ year: number }} fiscalYear
 */
export async function allocateClaimNo(tx, fiscalYearId, fiscalYear) {
  await tx.$executeRawUnsafe(
    "SELECT pg_advisory_xact_lock(hashtext($1::text))",
    String(fiscalYearId),
  );

  const year = fiscalYear.year;
  const middle = claimNoMiddleSegment();
  const rows = await tx.claim.findMany({
    where: { fiscalYearId },
    select: { claimNo: true },
  });

  const escaped = middle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${year}-${escaped}-(\\d+)$`);
  let max = 0;
  for (const { claimNo } of rows) {
    const m = claimNo.match(re);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }

  const next = max + 1;
  return `${year}-${middle}-${next}`;
}
