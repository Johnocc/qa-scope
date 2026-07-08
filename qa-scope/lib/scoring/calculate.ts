import type { ItemEval, RiskFlag, EvalOutput } from './types'

export const SCORE_TABLE = {
  A1: 4, A2: 4, A3: 4,
  B1: 8, B2: 6, B3: 6, B4: 6,
  C1: 6, C2: 6, C3: 6,
  D1: 7, D2: 5, D3: 5, D4: 4, D5: 4, D6: 5,
  E1: 7, E2: 7,
} as const satisfies Record<ItemEval['항목코드'], number>

function itemScore(level: ItemEval['충족수준'], base: number): number {
  if (level === '충족') return base
  if (level === '부분충족') return base / 2
  return 0
}

export function fillItemScores(items: ItemEval[]): ItemEval[] {
  return items.map((item) => {
    const base = SCORE_TABLE[item.항목코드]
    const 획득점수 = itemScore(item.충족수준, base)
    return {
      항목코드: item.항목코드,
      충족수준: item.충족수준,
      배점: base,
      획득점수,
      근거: item.근거,
      코멘트: item.코멘트,
    }
  })
}

// cutoff는 호출자(pipeline)가 app_config.low_score_cut을 읽어 주입한다.
// 채점 코어를 순수 함수로 유지하기 위해 process.env를 직접 참조하지 않는다.
// 폴백 70은 인자 미전달 시 방어용일 뿐, 정본은 app_config다.
export function calcAggregate(
  items: ItemEval[],
  flags: RiskFlag[],
  cutoff = 70
): { 집계: EvalOutput['집계']; flags: RiskFlag[] } {
  let naBaseSum = 0
  let rawSum = 0

  for (const item of items) {
    const base = SCORE_TABLE[item.항목코드]
    if (item.충족수준 === '해당없음') {
      naBaseSum += base
    } else {
      rawSum += itemScore(item.충족수준, base)
    }
  }

  const 적용배점합 = 100 - naBaseSum
  const 원점수합 = rawSum
  const 환산총점 =
    적용배점합 > 0
      ? Math.round((원점수합 / 적용배점합) * 1000) / 10
      : 0

  // 규칙5: D1~D5 적용배점합이 0(전부 N/A)이면 신규판매 상담이 아니므로 건너뜀
  const d15BaseSum = items
    .filter(
      (item) =>
        ['D1', 'D2', 'D3', 'D4', 'D5'].includes(item.항목코드) &&
        item.충족수준 !== '해당없음'
    )
    .reduce((s, item) => s + SCORE_TABLE[item.항목코드], 0)

  const effectiveFlags: RiskFlag[] = [...flags]
  if (d15BaseSum > 0) {
    const dItems = items.filter(
      (item) => item.항목코드.startsWith('D') && item.충족수준 !== '해당없음'
    )
    const dBaseSum = dItems.reduce((s, item) => s + SCORE_TABLE[item.항목코드], 0)
    const dScoreSum = dItems.reduce(
      (s, item) => s + itemScore(item.충족수준, SCORE_TABLE[item.항목코드]),
      0
    )
    if (dScoreSum / dBaseSum < 0.5) {
      const pct = Math.round((dScoreSum / dBaseSum) * 1000) / 10
      effectiveFlags.push({
        규칙번호: 5,
        근거: `D영역 득점률 ${pct}% (기준 50% 미만)`,
      })
    }
  }

  const criticalFlagNums = new Set<number>([1, 2, 5, 6])
  const hasCritical = effectiveFlags.some((f) => criticalFlagNums.has(f.규칙번호))
  const isLowScore = 환산총점 < cutoff

  const 상태라벨: EvalOutput['집계']['상태라벨'] = hasCritical
    ? '불완전판매 의심'
    : isLowScore
    ? '저점수'
    : '정상'

  return {
    집계: {
      원점수합,
      적용배점합,
      환산총점,
      위험표시여부: effectiveFlags.length > 0,
      상태라벨,
    },
    flags: effectiveFlags,
  }
}
