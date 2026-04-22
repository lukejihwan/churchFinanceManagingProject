/**
 * 예산 항목 목록으로부터 id → "상위/하위/말단" 경로 조회 함수를 만듭니다.
 * @param {Array<{ id: bigint, parentId: bigint | null, name: string }>} items
 * @returns {(budgetItemId: bigint) => string}
 */
export function buildBudgetItemPathLookup(items) {
  const map = new Map(items.map((it) => [String(it.id), it]));
  return function pathFor(budgetItemId) {
    const segments = [];
    let cur = map.get(String(budgetItemId));
    const guard = new Set();
    while (cur && !guard.has(String(cur.id))) {
      guard.add(String(cur.id));
      segments.push(String(cur.name ?? ""));
      cur = cur.parentId != null ? map.get(String(cur.parentId)) : null;
    }
    return segments.reverse().join("/");
  };
}

/**
 * 저장·검증용: `/` 로 구분된 경로 문자열을 세그먼트 배열로 분해합니다.
 * @param {unknown} input
 * @returns {string[]}
 */
export function parseBudgetItemPathSegments(input) {
  const raw = String(input ?? "");
  const segments = raw
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (segments.length === 0) {
    throw new Error("항목 경로를 입력하세요. 예: 운영비 또는 운영비/하위항목");
  }
  const maxSeg = 150;
  for (const s of segments) {
    if (s.length > maxSeg) {
      throw new Error(`경로의 각 구간은 ${maxSeg}자 이내여야 합니다: …${s.slice(0, 20)}`);
    }
  }
  if (segments.length > 40) {
    throw new Error("항목 경로 단계가 너무 많습니다. 40단계 이내로 입력하세요.");
  }
  return segments;
}

/**
 * @param {string[]} segments
 */
export function formatBudgetItemPath(segments) {
  return segments.join("/");
}
