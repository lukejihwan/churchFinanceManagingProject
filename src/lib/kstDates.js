/** 한국 표준시(KST) 기준 날짜·시간 유틸 */

const KST = "Asia/Seoul";

/**
 * KST 달력 기준 오늘 날짜만 (DB @db.Date 저장용)
 * @returns {Date}
 */
export function todayKstDateOnly() {
  const ymd = new Date().toLocaleDateString("sv-SE", { timeZone: KST });
  return new Date(`${ymd}T00:00:00.000Z`);
}

/**
 * Date(@db.Date 또는 일반 Date)를 KST 달력의 YYYY-MM-DD로 표시
 * @param {Date | null | undefined} d
 */
export function formatKstYmd(d) {
  if (!d) return "";
  return d.toLocaleDateString("sv-SE", { timeZone: KST });
}

/**
 * 시각(DateTime)을 KST 로캘 문자열로 표시
 * @param {Date | null | undefined} d
 */
export function formatKstDateTime(d) {
  if (!d) return "";
  return d.toLocaleString("ko-KR", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * KST 기준 `YYYY-MM-DD HH:mm:ss` (PHP Y-m-d H:i:s 스타일)
 * @param {Date | null | undefined} d
 */
export function formatKstYmdHis(d) {
  if (!d) return "";
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = f.formatToParts(d);
  const o = {};
  for (const p of parts) {
    if (p.type !== "literal") o[p.type] = p.value;
  }
  return `${o.year}-${o.month}-${o.day} ${o.hour}:${o.minute}:${o.second}`;
}
