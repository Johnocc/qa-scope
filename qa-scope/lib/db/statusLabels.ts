/**
 * lib/db/statusLabels.ts — 상태라벨 병기 배열 계산 (화면① 계약 §3.3 정본)
 *
 * 화면①(목록)과 화면②(상세 header)가 같은 병기 규칙을 쓴다.
 * 라우트마다 재구현하면 ①↔② 배지가 어긋나므로 반드시 이 함수만 사용할 것.
 *
 * 규칙 (계약 §3.3 — 서버 계산):
 *   불완전판매 의심 = (저장된 status_label == '불완전판매 의심')
 *   저점수        = (final_score < 조회 시점 low_score_cut)   ← app_config, 하드코딩 금지
 *   둘 다 아니면  = ["정상"]
 * 순서 고정: ["불완전판매 의심", "저점수"] (불완전판매 의심 먼저 — v14 팀 결정)
 *
 * 주의: 저점수 병기 여부는 "조회 시점" 컷으로 재판정한다. 컷 변경 시 저장값
 * status_label과 어긋날 수 있으며 이는 정상 동작이다 (계약 결정 7).
 */

/** 컷값 로드 폴백 기본치 — configRepo.getNumber('low_score_cut', DEFAULT_LOW_SCORE_CUT) 형태로 사용 */
export const DEFAULT_LOW_SCORE_CUT = Number(process.env.LOW_SCORE_CUT || 70)

export function computeStatusLabels(
  statusLabel: string,
  finalScore: number,
  lowScoreCut: number,
): string[] {
  const labels: string[] = []
  if (statusLabel === '불완전판매 의심') labels.push('불완전판매 의심')
  if (Number(finalScore) < lowScoreCut) labels.push('저점수')
  return labels.length > 0 ? labels : ['정상']
}
