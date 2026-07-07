/**
 * lib/scoring/constants.ts — 루브릭 v1.5 고정값 (스키마 ENUM과 1:1 정합)
 * 배점을 여기 한 곳에만 두고, 형식검증·재계산이 전부 이 값을 참조한다.
 */

/** 루브릭 v1.5 항목별 고정 배점 (합계 100) */
export const MAX_SCORES = {
  A1: 4, A2: 4, A3: 4,
  B1: 8, B2: 6, B3: 6, B4: 6,
  C1: 6, C2: 6, C3: 6,
  D1: 7, D2: 5, D3: 5, D4: 4, D5: 4, D6: 5,
  E1: 7, E2: 7,
} as const;

/** 'A1' | 'A2' | ... | 'E2' — MAX_SCORES 키에서 자동 파생 */
export type ItemCode = keyof typeof MAX_SCORES;

export const ITEM_CODES = Object.keys(MAX_SCORES) as ItemCode[]; // 18개, 순서 고정

export const LEVELS = ['충족', '부분충족', '미충족', '해당없음'] as const;
export type Level = (typeof LEVELS)[number];

export const CONSULT_TYPES = ['신규·보장', '계약변경', '해지·환급', '보험금청구', '단순문의'] as const;
export const RECOMMEND_TYPES = ['없음', '신규판매', '유지·해지방어·승환'] as const;
export const MATCH_VERDICTS = ['적합', '부적합', '명백한 오류'] as const;
export const STATUS_LABELS = ['정상', '불완전판매 의심', '저점수'] as const;
export type StatusLabel = (typeof STATUS_LABELS)[number];
export const EVALUATORS = ['AI_최종', '사람_골든셋'] as const;
export const VERIFY_STAGES = ['형식검증', '인용대조', '교차검증'] as const;

/** 상태라벨 '불완전판매 의심'을 켜는 위험플래그 규칙 (루브릭 §3 — 1·2·5·6) */
export const MISSALE_RULES = new Set<number>([1, 2, 5, 6]);

/** 충족수준 → 기대 획득점수 (형식검증 1단계에서 대조) */
export function expectedScore(level: string, maxScore: number): number {
  switch (level) {
    case '충족': return maxScore;
    case '부분충족': return maxScore / 2; // 5점 항목이면 2.5
    case '미충족':
    case '해당없음': return 0;
    default: return NaN;
  }
}
