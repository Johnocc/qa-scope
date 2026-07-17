/**
 * lib/db/agentReportRepo.ts — 화면④ 상담사 개인 평가 리포트 집계 (3순위 작업)
 *
 * 정본 계약: docs/api/화면4_상담사리포트_API계약_v1.md
 *  - 응답 블록: meta / summary / domain_rates(5) / items(18 고정) / improvement_items
 *  - N/A 규칙: level='해당없음'은 분자·분모 모두 제외. 항목은 배열에서 빼지
 *    않고 status='해당없음' + 수치 null로 유지 (팀 결정 2026-07-05)
 *  - 상태·약점·개선목록은 여기(서버)서 계산 — 프론트 재계산 금지
 *  - 집계 대상은 AI_최종 평가만 (사람_골든셋은 회귀 검증용 — 화면 집계 제외)
 *
 * 충돌 방지: 이 파일은 신규 파일이며 기존 레포(evaluationRepo 등)를 수정하지
 * 않는다. 배점·항목코드는 lib/scoring/constants.ts를 읽기만 한다.
 */
import { query } from './pool'
import * as configRepo from './configRepo'
import { getAgent } from './agentRepo'
import { getAllTips } from './coachingTipsRepo'
import { MAX_SCORES, ITEM_CODES, type ItemCode } from '../scoring/constants'

// ---------------------------------------------------------------------
// 계약 §2 — 기간 파라미터
// ---------------------------------------------------------------------
export const PERIODS = ['30d', '90d', 'all'] as const
export type Period = (typeof PERIODS)[number]

export function isPeriod(v: string): v is Period {
  return (PERIODS as readonly string[]).includes(v)
}

// ---------------------------------------------------------------------
// 루브릭 v1.5 표시 문구 (계약 §3.2·§3.4)
// ---------------------------------------------------------------------
const ITEM_NAMES: Record<ItemCode, string> = {
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
}

const DOMAIN_CODES = ['A', 'B', 'C', 'D', 'E'] as const
type DomainCode = (typeof DOMAIN_CODES)[number]

const DOMAIN_NAMES: Record<DomainCode, string> = {
  A: '상담 도입',
  B: '업무처리',
  C: '태도·공감',
  D: '보험특화(불완전판매 방지)',
  E: '상담 마무리',
}

/** 약점 배지 표시 문구 — 화면③ 약점항목 컬럼과 공통 (계약 §3.2 고정 매핑)
 *  C는 영역명과 동일한 '태도·공감' — '경청'은 A영역(A3) 키워드와 겹쳐 금지 (팀 결정 2026-07-09) */
const WEAK_LABELS: Record<DomainCode, string> = {
  A: '상담 도입',
  B: '업무처리',
  C: '태도·공감',
  D: '불완전판매 고지',
  E: '상담 마무리',
}

/** 영역별 배점 합 (동률 약점 tie-break용: D30 > B26 > C18 > E14 > A12) */
const DOMAIN_MAX: Record<DomainCode, number> = (() => {
  const acc = { A: 0, B: 0, C: 0, D: 0, E: 0 } as Record<DomainCode, number>
  for (const code of ITEM_CODES) acc[code[0] as DomainCode] += MAX_SCORES[code]
  return acc
})()

export interface WeakDomain {
  domain_code: DomainCode
  domain_name: string
  label: string
}

/**
 * 약점 영역 선정 (계약 ④ §3.2 = 계약 ③ 결정 4 — 단일 구현, 별도 재구현 금지).
 * 규칙: 적용(rate≠null) 영역 중 달성률 최저 → 동률이면 배점 합 큰 영역
 * (D30 > B26 > C18 > E14 > A12) → 최저 영역도 okCut 이상이면 약점 없음(null).
 * 화면③(전원 표)과 화면④(개인 리포트)가 이 함수를 공유해 ③↔④ 불일치를 막는다.
 */
export function selectWeakDomain(
  domainRates: { domain_code: DomainCode; rate: number | null }[],
  okCut: number,
): WeakDomain | null {
  const applied = domainRates.filter((d) => d.rate !== null)
  if (applied.length === 0) return null
  const worst = [...applied].sort(
    (a, b) => a.rate! - b.rate! || DOMAIN_MAX[b.domain_code] - DOMAIN_MAX[a.domain_code],
  )[0]
  if (worst.rate! >= okCut) return null
  return {
    domain_code: worst.domain_code,
    domain_name: DOMAIN_NAMES[worst.domain_code],
    label: WEAK_LABELS[worst.domain_code],
  }
}

// ---------------------------------------------------------------------
// 응답 타입 (계약 §3 — snake_case)
// ---------------------------------------------------------------------
export interface AgentReport {
  meta: {
    agent_id: string
    agent_name: string
    period: Period
    period_from: string | null
    period_to: string
    generated_at: string
    rubric_version: string
    thresholds: { item_rate_warn: number; item_rate_ok: number }
  }
  // v1.2(2026-07-08): 순위·팀 비교 필드(rank·agent_count·team_avg_score·team_rate) 제거 —
  // 코칭 도구 철학(줄세우기 배제). 재도입 여지는 계약 §6 참조 (git 이력에서 복원).
  summary: {
    evaluation_count: number
    total_evaluation_count: number
    avg_score: number | null
    risk_count: number
    total_risk_count: number
    weak_domain: { domain_code: DomainCode; domain_name: string; label: string } | null
  }
  domain_rates: {
    domain_code: DomainCode
    domain_name: string
    rate: number | null
    applied_count: number
  }[]
  items: {
    item_code: ItemCode
    item_name: string
    domain_code: DomainCode
    max_score: number
    applied_count: number
    na_count: number
    avg_earned: number | null
    rate: number | null
    status: '양호' | '보통' | '개선 필요' | '해당없음'
  }[]
  improvement_items: {
    item_code: ItemCode
    item_name: string
    domain_code: DomainCode
    rate: number
    tip: string | null
  }[]
  /** rate < item_rate_warn 전체 항목 수(5개 초과분 존재 여부 판단용). improvement_items는 여전히 최대 5개 */
  improvement_items_total_count: number
}

// ---------------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------------

/** 계약 §4 — 반올림은 계산 마지막에 1회, 소수 1자리 */
function round1(x: number): number {
  return Math.round(x * 10) / 10
}

function toDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 기간 → 하한 날짜('YYYY-MM-DD') 또는 null(전체 기간). 기준: consulted_at (계약 §1-3) */
function periodFromDate(period: Period): string | null {
  if (period === 'all') return null
  const days = period === '30d' ? 30 : 90
  const d = new Date()
  d.setDate(d.getDate() - days)
  return toDateString(d)
}

/** 기간 WHERE 절 조각 + 파라미터 (모든 집계 쿼리가 동일 조각 사용 — 수치 불일치 방지) */
function periodClause(fromDate: string | null): { sql: string; params: any[] } {
  return fromDate
    ? { sql: 'AND c.consulted_at >= ?', params: [fromDate] }
    : { sql: '', params: [] }
}

// ---------------------------------------------------------------------
// 집계 쿼리 3종
// ---------------------------------------------------------------------

/** ① 요약 — 본인/전체 건수·평균·위험 건수를 조건부 집계로 한 번에.
 *  전체 카운트(total_cnt·total_risk)는 표본 표기용으로 응답에 유지 (계약 v1.2 결정 8) */
async function fetchSummaryStats(agentId: string, fromDate: string | null) {
  const p = periodClause(fromDate)
  const rows = await query<{
    total_cnt: number
    agent_cnt: number
    agent_avg: number | null
    total_risk: number
    agent_risk: number
  }>(
    `SELECT
       COUNT(*)                                                    AS total_cnt,
       COALESCE(SUM(c.agent_id = ?), 0)                            AS agent_cnt,
       AVG(CASE WHEN c.agent_id = ? THEN m.final_score END)        AS agent_avg,
       COALESCE(SUM(m.risk_flagged), 0)                            AS total_risk,
       COALESCE(SUM(CASE WHEN c.agent_id = ? THEN m.risk_flagged END), 0) AS agent_risk
     FROM ai_evaluation_master m
     JOIN consultation_master c ON c.consultation_id = m.consultation_id
     WHERE m.evaluator = 'AI_최종' ${p.sql}`,
    [agentId, agentId, agentId, ...p.params],
  )
  return rows[0]
}

/** ② 영역별 획득률 — 본인만, N/A 제외 (계약 §4. 팀 획득률은 v1.2에서 제거) */
async function fetchDomainRates(agentId: string, fromDate: string | null) {
  const p = periodClause(fromDate)
  return query<{
    domain_code: DomainCode
    a_earned: number | null
    a_max: number | null
    a_applied: number
  }>(
    `SELECT
       LEFT(d.item_code, 1)             AS domain_code,
       SUM(d.earned_score)              AS a_earned,
       SUM(d.max_score)                 AS a_max,
       COUNT(DISTINCT d.evaluation_id)  AS a_applied
     FROM ai_evaluation_details d
     JOIN ai_evaluation_master m ON m.evaluation_id = d.evaluation_id
     JOIN consultation_master c ON c.consultation_id = m.consultation_id
     WHERE m.evaluator = 'AI_최종' AND c.agent_id = ? AND d.level <> '해당없음' ${p.sql}
     GROUP BY domain_code`,
    [agentId, ...p.params],
  )
}

/** ③ 항목별 상세 — 적용/N/A 건수·평균 획득 (없는 항목은 빌더가 18개로 채움) */
async function fetchItemStats(agentId: string, fromDate: string | null) {
  const p = periodClause(fromDate)
  return query<{
    item_code: ItemCode
    applied_count: number
    na_count: number
    avg_earned: number | null
  }>(
    `SELECT
       d.item_code,
       COALESCE(SUM(d.level <> '해당없음'), 0) AS applied_count,
       COALESCE(SUM(d.level = '해당없음'), 0)  AS na_count,
       AVG(CASE WHEN d.level <> '해당없음' THEN d.earned_score END) AS avg_earned
     FROM ai_evaluation_details d
     JOIN ai_evaluation_master m ON m.evaluation_id = d.evaluation_id
     JOIN consultation_master c ON c.consultation_id = m.consultation_id
     WHERE m.evaluator = 'AI_최종' AND c.agent_id = ? ${p.sql}
     GROUP BY d.item_code`,
    [agentId, ...p.params],
  )
}

/** 기간=all일 때 meta.period_from = 이 상담사의 최초 상담일 (계약 §3.1) */
async function fetchFirstConsultedDate(agentId: string): Promise<string | null> {
  const rows = await query<{ first_date: string | null }>(
    `SELECT DATE_FORMAT(MIN(c.consulted_at), '%Y-%m-%d') AS first_date
     FROM ai_evaluation_master m
     JOIN consultation_master c ON c.consultation_id = m.consultation_id
     WHERE m.evaluator = 'AI_최종' AND c.agent_id = ?`,
    [agentId],
  )
  return rows[0]?.first_date ?? null
}

// ---------------------------------------------------------------------
// 리포트 빌더 — GET /api/agents/{agent_id}/report 응답 전체 조립
// ---------------------------------------------------------------------

/** @returns 계약 v1 형태의 리포트. 상담사가 명부에 없으면 null (라우트가 404 처리) */
export async function buildAgentReport(agentId: string, period: Period): Promise<AgentReport | null> {
  const agent = await getAgent(agentId)
  if (!agent) return null

  // 임계값은 app_config 정본 → 미기동 시 계약 기본값 폴백 (하드코딩 금지 원칙)
  const warn = await configRepo.getNumber('item_rate_warn', 60)
  const ok = await configRepo.getNumber('item_rate_ok', 80)
  const statusOf = (rate: number | null): AgentReport['items'][number]['status'] => {
    if (rate === null) return '해당없음'
    if (rate < warn) return '개선 필요'
    if (rate < ok) return '보통'
    return '양호'
  }

  const fromDate = periodFromDate(period)
  const [stats, domainRows, itemRows, tips] = await Promise.all([
    fetchSummaryStats(agentId, fromDate),
    fetchDomainRates(agentId, fromDate),
    fetchItemStats(agentId, fromDate),
    getAllTips(),
  ])

  // ---- domain_rates (항상 5개, A→E — 계약 §3.3. v1.2: 본인 값만) ----
  const domainByCode = new Map(domainRows.map((r) => [r.domain_code, r]))
  const domain_rates: AgentReport['domain_rates'] = DOMAIN_CODES.map((code) => {
    const r = domainByCode.get(code)
    const hasAgent = r != null && r.a_max != null && Number(r.a_max) > 0
    return {
      domain_code: code,
      domain_name: DOMAIN_NAMES[code],
      rate: hasAgent ? round1((Number(r!.a_earned) / Number(r!.a_max)) * 100) : null,
      applied_count: r?.a_applied ?? 0,
    }
  })

  // ---- weak_domain: 최저 달성률 영역 (③·④ 공유 순수 함수 selectWeakDomain — 계약 §3.2) ----
  // 최저 영역도 ok 컷 이상이면 약점 없음(null) — 전 영역 우수한 상담사에게
  // 배지를 달지 않기 위함 (화면③ 목업의 "약점 항목: 없음" 행과 동일 의미)
  const weak_domain: AgentReport['summary']['weak_domain'] = selectWeakDomain(domain_rates, ok)

  // ---- items (항상 18개, 루브릭 순 — 계약 §3.4) ----
  const itemByCode = new Map(itemRows.map((r) => [r.item_code, r]))
  const items: AgentReport['items'] = ITEM_CODES.map((code) => {
    const r = itemByCode.get(code)
    const appliedCount = r?.applied_count ?? 0
    const avgEarned = appliedCount > 0 && r?.avg_earned != null ? round1(Number(r.avg_earned)) : null
    const rate =
      appliedCount > 0 && r?.avg_earned != null
        ? round1((Number(r.avg_earned) / MAX_SCORES[code]) * 100)
        : null
    return {
      item_code: code,
      item_name: ITEM_NAMES[code],
      domain_code: code[0] as DomainCode,
      max_score: MAX_SCORES[code],
      applied_count: appliedCount,
      na_count: r?.na_count ?? 0,
      avg_earned: avgEarned,
      rate,
      status: statusOf(rate),
    }
  })

  // ---- improvement_items: rate < warn, 오름차순, 최대 5개 (계약 §3.5) ----
  const improvementCandidates = items
    .filter((it) => it.rate !== null && it.rate < warn)
    .sort((a, b) => a.rate! - b.rate!)
  const improvement_items: AgentReport['improvement_items'] = improvementCandidates
    .slice(0, 5)
    .map((it) => ({
      item_code: it.item_code,
      item_name: it.item_name,
      domain_code: it.domain_code,
      rate: it.rate!,
      tip: tips[it.item_code] ?? null,
    }))

  // ---- meta ----
  const today = toDateString(new Date())
  const period_from = period === 'all' ? await fetchFirstConsultedDate(agentId) : fromDate

  return {
    meta: {
      agent_id: agentId,
      agent_name: agent.agent_name,
      period,
      period_from,
      period_to: today,
      generated_at: new Date().toISOString(),
      rubric_version: 'v1.5',
      thresholds: { item_rate_warn: warn, item_rate_ok: ok },
    },
    summary: {
      evaluation_count: Number(stats.agent_cnt),
      total_evaluation_count: Number(stats.total_cnt),
      avg_score: stats.agent_avg == null ? null : round1(Number(stats.agent_avg)),
      risk_count: Number(stats.agent_risk),
      total_risk_count: Number(stats.total_risk),
      weak_domain,
    },
    domain_rates,
    items,
    improvement_items,
    improvement_items_total_count: improvementCandidates.length,
  }
}

// ---------------------------------------------------------------------
// 화면③ 대시보드 — GET /api/agents/summary 응답 전체 조립
// 정본 계약: docs/api/화면3_상담사대시보드_API계약_v1.md
// 집계 수식·기간 기준·약점 규칙은 화면④(위 buildAgentReport)와 전부 공유:
// periodFromDate/periodClause·건 단위 평균·N/A 제외·selectWeakDomain·round1.
// 같은 기간이라면 ③의 어떤 수치도 ④와 어긋나면 버그다 (계약 §4 정합 표).
// ---------------------------------------------------------------------

export interface AgentsSummary {
  meta: {
    period: Period
    period_from: string | null
    period_to: string
    generated_at: string
    rubric_version: string
  }
  summary: {
    avg_score: number | null
    evaluation_count: number
    risk_count: number
    agent_count: number
  }
  agents: {
    agent_id: string
    agent_name: string
    evaluation_count: number
    avg_score: number | null
    risk_count: number
    weak_domain: WeakDomain | null
  }[]
}

export async function buildAgentsSummary(period: Period): Promise<AgentsSummary> {
  const ok = await configRepo.getNumber('item_rate_ok', 80)
  const fromDate = periodFromDate(period)
  const p = periodClause(fromDate)

  const [overallRows, agentRows, domainRows] = await Promise.all([
    // 상단 카드 4개 — 표에서 합산하지 않고 같은 쿼리 기준으로 직접 집계 (계약 §3.2)
    query<{
      cnt: number
      avg_score: number | null
      risk_cnt: number
      first_date: string | null
    }>(
      `SELECT COUNT(*) AS cnt,
              AVG(m.final_score) AS avg_score,
              COALESCE(SUM(m.risk_flagged), 0) AS risk_cnt,
              DATE_FORMAT(MIN(c.consulted_at), '%Y-%m-%d') AS first_date
         FROM ai_evaluation_master m
         JOIN consultation_master c ON c.consultation_id = m.consultation_id
        WHERE m.evaluator = 'AI_최종' ${p.sql}`,
      p.params,
    ),
    // 상담사별 건수·평균·위험 (unknown 포함 — 계약 결정 6)
    query<{
      agent_id: string
      agent_name: string | null
      cnt: number
      avg_score: number | null
      risk_cnt: number
    }>(
      `SELECT c.agent_id,
              a.agent_name,
              COUNT(*) AS cnt,
              AVG(m.final_score) AS avg_score,
              COALESCE(SUM(m.risk_flagged), 0) AS risk_cnt
         FROM ai_evaluation_master m
         JOIN consultation_master c ON c.consultation_id = m.consultation_id
         LEFT JOIN agents a ON a.agent_id = c.agent_id
        WHERE m.evaluator = 'AI_최종' ${p.sql}
        GROUP BY c.agent_id, a.agent_name`,
      p.params,
    ),
    // 상담사×영역 달성률 (N/A 제외 — ④ fetchDomainRates와 동일 수식의 GROUP BY 확장)
    query<{
      agent_id: string
      domain_code: DomainCode
      earned: number | null
      max_sum: number | null
    }>(
      `SELECT c.agent_id,
              LEFT(d.item_code, 1) AS domain_code,
              SUM(d.earned_score) AS earned,
              SUM(d.max_score) AS max_sum
         FROM ai_evaluation_details d
         JOIN ai_evaluation_master m ON m.evaluation_id = d.evaluation_id
         JOIN consultation_master c ON c.consultation_id = m.consultation_id
        WHERE m.evaluator = 'AI_최종' AND d.level <> '해당없음' ${p.sql}
        GROUP BY c.agent_id, domain_code`,
      p.params,
    ),
  ])
  const overall = overallRows[0]

  // 상담사별 영역 달성률 → 약점 선정 (④와 같은 selectWeakDomain)
  const ratesByAgent = new Map<string, { domain_code: DomainCode; rate: number | null }[]>()
  for (const r of domainRows) {
    if (!ratesByAgent.has(r.agent_id)) ratesByAgent.set(r.agent_id, [])
    const hasMax = r.max_sum != null && Number(r.max_sum) > 0
    ratesByAgent.get(r.agent_id)!.push({
      domain_code: r.domain_code,
      rate: hasMax ? round1((Number(r.earned) / Number(r.max_sum)) * 100) : null,
    })
  }

  const agents: AgentsSummary['agents'] = agentRows
    .map((r) => ({
      agent_id: r.agent_id,
      agent_name: r.agent_name ?? (r.agent_id === 'unknown' ? '미배정' : r.agent_id),
      evaluation_count: Number(r.cnt),
      avg_score: r.avg_score == null ? null : round1(Number(r.avg_score)),
      risk_count: Number(r.risk_cnt),
      weak_domain: selectWeakDomain(ratesByAgent.get(r.agent_id) ?? [], ok),
    }))
    // 위험 건수 내림차순 → 평균 오름차순 → agent_id 오름차순
    // (계약 결정 5 개정 2026-07-16). 순위 숫자는 계산·표시하지 않음
    .sort((a, b) => {
      if (b.risk_count !== a.risk_count) return b.risk_count - a.risk_count
      if (a.avg_score === null && b.avg_score === null) return a.agent_id.localeCompare(b.agent_id)
      if (a.avg_score === null) return 1
      if (b.avg_score === null) return -1
      return a.avg_score - b.avg_score || a.agent_id.localeCompare(b.agent_id)
    })

  return {
    meta: {
      period,
      period_from: period === 'all' ? overall.first_date : fromDate,
      period_to: toDateString(new Date()),
      generated_at: new Date().toISOString(),
      rubric_version: 'v1.5',
    },
    summary: {
      avg_score: overall.avg_score == null ? null : round1(Number(overall.avg_score)),
      evaluation_count: Number(overall.cnt),
      risk_count: Number(overall.risk_cnt),
      agent_count: agents.length,
    },
    agents,
  }
}
