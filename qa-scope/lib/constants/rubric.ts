/**
 * 루브릭 v1.5 고정값 — 화면②는 항목명·영역명을 서버가 내려주지 않으므로
 * (계약 §3.2 주석: "항목명·영역명은 응답에 없다 — 프론트 상수로 유지") 여기
 * 상수를 화면②에서 쓴다. 화면④ API는 item_name·domain_name을 직접 내려주니
 * 그건 서버 값을 그대로 쓰면 된다 — 이 파일과 값이 갈리면 버그.
 *
 * 정본: lib/scoring/constants.ts (배점) · lib/db/agentReportRepo.ts (표시 문구)
 * C 영역 표시명은 '경청' 키워드 금지 — A3(경청)와 겹쳐서 팀 결정으로 통일
 * (CLAUDE.md §5.3, 화면④ 계약 v1.3).
 */

export const ITEM_CODES = [
  'A1', 'A2', 'A3',
  'B1', 'B2', 'B3', 'B4',
  'C1', 'C2', 'C3',
  'D1', 'D2', 'D3', 'D4', 'D5', 'D6',
  'E1', 'E2',
] as const;

export type ItemCode = (typeof ITEM_CODES)[number];
export type DomainCode = 'A' | 'B' | 'C' | 'D' | 'E';

export const ITEM_NAMES: Record<ItemCode, string> = {
  A1: '맞이인사 및 소속·성명 밝히기',
  A2: '고객 본인확인',
  A3: '경청 및 용건·니즈 파악',
  B1: '정보 정확성',
  B2: '쉬운 설명',
  B3: '적극적 해결·대안 제시',
  B4: '신속·효율적 처리',
  C1: '공감 표현',
  C2: '친절·언어예절',
  C3: '감정 대응',
  D1: '중요사항 설명의무',
  D2: '적합성 원칙(절차+결과)',
  D3: '고지의무 안내',
  D4: '면책·부지급 사유 설명',
  D5: '청약철회·해피콜 안내',
  D6: '허위·과장 및 부당권유 금지',
  E1: '처리내용 재확인·이해 점검',
  E2: '종료 인사·추가 안내',
};

export const MAX_SCORES: Record<ItemCode, number> = {
  A1: 4, A2: 4, A3: 4,
  B1: 8, B2: 6, B3: 6, B4: 6,
  C1: 6, C2: 6, C3: 6,
  D1: 7, D2: 5, D3: 5, D4: 4, D5: 4, D6: 5,
  E1: 7, E2: 7,
};

export const DOMAIN_CODES: DomainCode[] = ['A', 'B', 'C', 'D', 'E'];

export const DOMAIN_NAMES: Record<DomainCode, string> = {
  A: '상담 도입',
  B: '업무처리',
  C: '태도·공감',
  D: '보험특화(불완전판매 방지)',
  E: '상담 마무리',
};

export function domainOf(itemCode: string): DomainCode {
  return itemCode[0] as DomainCode;
}
