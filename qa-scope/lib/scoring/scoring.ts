/**
 * lib/scoring/scoring.ts — 채점 JSON의 형식검증(파이프라인 ①)과 집계 재계산
 *
 * 원칙 (출력스키마 ver2 명시):
 *   "'집계' 블록은 AI가 채우더라도 애플리케이션이 항목평가에서
 *    결정론적으로 재계산할 것 (LLM 산수 미신뢰)"
 * → AI가 보낸 집계는 참고값으로만 두고, DB에는 여기서 계산한 값을 저장한다.
 *
 * 참고: AI 반환 JSON은 한글 키의 복잡한 중첩 구조라 여기서는 느슨한 타입(any)으로
 *       받는다. 스키마 정본은 schemas/상담평가_출력스키마_ver2.json 이며,
 *       구조 정합성은 아래 validateEvaluationJson 이 런타임에 검사한다.
 */
import {
  MAX_SCORES, ITEM_CODES, LEVELS,
  CONSULT_TYPES, RECOMMEND_TYPES, MISSALE_RULES,
  expectedScore,
  type ItemCode, type StatusLabel,
} from './constants';

export interface ValidationResult {
  ok: boolean;
  issues: string[];
}

export interface Aggregates {
  rawScoreSum: number;
  appliedMaxSum: number;
  finalScore: number;
  riskFlagged: boolean;
  statusLabel: StatusLabel;
}

/**
 * 파이프라인 ① 형식검증.
 * AI가 반환한 채점 JSON(출력스키마 ver2, 한글 키)의 구조·값 정합을 검사.
 */
export function validateEvaluationJson(payload: any): ValidationResult {
  const issues: string[] = [];
  const p = payload || {};

  if (p['상담ID'] === undefined || p['상담ID'] === null || p['상담ID'] === '') {
    issues.push('상담ID 누락');
  }

  // --- 분류 ---
  const cls = p['분류'];
  if (!cls) {
    issues.push('분류 블록 누락');
  } else {
    if (!(CONSULT_TYPES as readonly string[]).includes(cls['상담유형'])) {
      issues.push(`상담유형 값 이상: ${cls['상담유형']}`);
    }
    if (!(RECOMMEND_TYPES as readonly string[]).includes(cls['권유유형'])) {
      issues.push(`권유유형 값 이상: ${cls['권유유형']}`);
    }
  }

  // --- 판매정보 ↔ 권유유형 정합 ---
  const rec = cls && cls['권유유형'];
  const sale = p['판매정보'];
  if (rec === '신규판매' && !sale) issues.push('권유유형=신규판매인데 판매정보가 null');
  if (rec !== '신규판매' && sale) issues.push('권유유형이 신규판매가 아닌데 판매정보가 채워짐');
  if (sale && sale['확인절차']) {
    for (const k of ['가입목적', '재정상황', '기존계약']) {
      if (typeof sale['확인절차'][k] !== 'boolean') issues.push(`확인절차.${k} boolean 아님`);
    }
  }

  // --- 항목평가: 18개 전부, 중복·누락 없이, 배점·획득점수 정합 ---
  const items: any[] = Array.isArray(p['항목평가']) ? p['항목평가'] : [];
  const seen = new Set<string>();
  for (const it of items) {
    const code = it['항목코드'] as string;
    if (!(ITEM_CODES as readonly string[]).includes(code)) {
      issues.push(`알 수 없는 항목코드: ${code}`);
      continue;
    }
    if (seen.has(code)) issues.push(`항목코드 중복: ${code}`);
    seen.add(code);

    if (!(LEVELS as readonly string[]).includes(it['충족수준'])) {
      issues.push(`${code} 충족수준 값 이상: ${it['충족수준']}`);
    }
    const max = MAX_SCORES[code as ItemCode];
    if (Number(it['배점']) !== max) {
      issues.push(`${code} 배점 불일치: ${it['배점']} (루브릭 v1.5 = ${max})`);
    }
    const expected = expectedScore(it['충족수준'], max);
    if (Number.isFinite(expected) && Number(it['획득점수']) !== expected) {
      issues.push(`${code} 획득점수 불일치: ${it['획득점수']} (충족수준상 기대값 ${expected})`);
    }
    // 근거: N/A가 아니면 1개 이상 권장
    const evid: any[] = Array.isArray(it['근거']) ? it['근거'] : [];
    if (it['충족수준'] !== '해당없음' && evid.length === 0) {
      issues.push(`${code} 근거 인용 없음 (충족수준=${it['충족수준']})`);
    }
  }
  for (const code of ITEM_CODES) {
    if (!seen.has(code)) issues.push(`항목 누락: ${code} (해당없음이라도 18개 전부 반환해야 함)`);
  }

  // --- 위험플래그 ---
  const flags: any[] = Array.isArray(p['위험플래그']) ? p['위험플래그'] : [];
  for (const f of flags) {
    const n = Number(f['규칙번호']);
    if (!(n >= 1 && n <= 6)) issues.push(`위험플래그 규칙번호 범위 밖: ${f['규칙번호']}`);
    if (!f['근거']) issues.push(`위험플래그(규칙${f['규칙번호']}) 근거 누락`);
  }

  if (typeof p['요약'] !== 'string' || !p['요약'].trim()) issues.push('요약 누락');
  if (typeof p['종합피드백'] !== 'string' || !p['종합피드백'].trim()) issues.push('종합피드백 누락');

  return { ok: issues.length === 0, issues };
}

/**
 * 집계 결정론적 재계산.
 * @param items 항목평가 배열 (형식검증 통과본)
 * @param flags 위험플래그 배열
 * @param lowScoreCut 저점수 기준선 (app_config, 기본 70)
 */
export function computeAggregates(items: any[], flags: any[], lowScoreCut = 70): Aggregates {
  let rawScoreSum = 0;
  let appliedMaxSum = 0;

  for (const it of items) {
    const code = it['항목코드'] as ItemCode;
    if (it['충족수준'] === '해당없음') continue; // 분모에서 제외
    appliedMaxSum += MAX_SCORES[code];
    rawScoreSum += expectedScore(it['충족수준'], MAX_SCORES[code]);
  }

  // 이론상 전 항목 N/A는 없지만(공통 10개는 항상 채점) 0 나눗셈 방어
  const finalScore = appliedMaxSum > 0
    ? Math.round((rawScoreSum / appliedMaxSum) * 1000) / 10 // 소수 1자리
    : 0;

  const ruleNumbers = (flags || []).map((f) => Number(f['규칙번호']));
  const riskFlagged = ruleNumbers.length > 0;
  const isMissale = ruleNumbers.some((n) => MISSALE_RULES.has(n));

  // 우선순위: 불완전판매 의심 > 저점수 > 정상 (루브릭 v1.5 상태라벨)
  let statusLabel: StatusLabel = '정상';
  if (isMissale) statusLabel = '불완전판매 의심';
  else if (finalScore < lowScoreCut) statusLabel = '저점수';

  return { rawScoreSum, appliedMaxSum, finalScore, riskFlagged, statusLabel };
}
