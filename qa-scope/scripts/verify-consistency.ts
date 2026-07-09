/**
 * scripts/verify-consistency.ts — 화면①·③·④ 수치 정합 회귀 검증
 *
 * 정본: docs/api/화면3_상담사대시보드_API계약_v1.md §4 정합 표.
 * 화면①의 총계는 기간 개념이 없는 "전량" 기준이므로 period=all로 대조한다.
 * 스키마·집계 로직을 손댈 때마다 실행하는 회귀 장치.
 *
 * 사용:  npx tsx scripts/verify-consistency.ts
 * 종료코드: 0 = 전부 일치 / 1 = 불일치 발견(또는 DB 접속 실패)
 *
 * 검사 항목
 *  [1] ① summary.total_count  == ③ summary.evaluation_count
 *  [2] ① summary.risk_count   == ③ summary.risk_count
 *  [3] ③ summary.avg_score    == AVG(final_score) 직접 검산 (④ §4 수식 — 건 단위 평균)
 *  [4] ③ agents[] 각 행의 건수·평균·위험·약점 == ④ buildAgentReport(같은 기간) summary
 *  [5] ③ agent_count == agents.length, 행 건수 합 == 전체 건수
 *  [6] ① status_labels 병기 규칙 검증 + §10.4 필수 케이스(정상 라벨 + 위험 점) 존재 보고
 */
import 'dotenv/config'
import { pool, query } from '../lib/db/pool.ts'
import * as configRepo from '../lib/db/configRepo.ts'
import * as evaluations from '../lib/db/evaluationRepo.ts'
import { buildAgentReport, buildAgentsSummary } from '../lib/db/agentReportRepo.ts'
import { computeStatusLabels, DEFAULT_LOW_SCORE_CUT } from '../lib/db/statusLabels.ts'

let failures = 0

function check(name: string, ok: boolean, detail: string) {
  if (ok) {
    console.log(`  ✓ ${name}`)
  } else {
    failures++
    console.error(`  ✗ ${name} — ${detail}`)
  }
}

function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

async function main() {
  console.log('화면①·③·④ 수치 정합 검증 (period=all 기준)\n')

  // ---- ① 목록 카운트 vs ③ 상단 카드 ----
  const counts = await evaluations.countForDashboard({})
  const dash = await buildAgentsSummary('all')

  console.log('[①↔③] 전체 카운트')
  check(
    '전체 평가 건수: ①total_count == ③evaluation_count',
    counts.total_count === dash.summary.evaluation_count,
    `① ${counts.total_count} ≠ ③ ${dash.summary.evaluation_count}`,
  )
  check(
    '전체 위험 건수: ①risk_count == ③risk_count',
    counts.risk_count === dash.summary.risk_count,
    `① ${counts.risk_count} ≠ ③ ${dash.summary.risk_count}`,
  )

  // ---- ③ 전체 평균 검산 (④ §4 수식 — 건 단위 AVG, 상담사 평균의 평균 아님) ----
  console.log('\n[③] 전체 평균 직접 검산')
  const avgRows = await query<{ avg_score: number | null }>(
    `SELECT AVG(m.final_score) AS avg_score
       FROM ai_evaluation_master m
      WHERE m.evaluator = 'AI_최종'`,
  )
  const expectedAvg =
    avgRows[0].avg_score == null ? null : Math.round(Number(avgRows[0].avg_score) * 10) / 10
  check(
    '③avg_score == AVG(final_score) 건 단위 평균',
    eq(dash.summary.avg_score, expectedAvg),
    `③ ${dash.summary.avg_score} ≠ 검산 ${expectedAvg}`,
  )

  // ---- ③ 자체 정합 ----
  console.log('\n[③] 자체 정합')
  check(
    'agent_count == agents.length',
    dash.summary.agent_count === dash.agents.length,
    `카드 ${dash.summary.agent_count} ≠ 행 ${dash.agents.length}`,
  )
  const rowSum = dash.agents.reduce((s, a) => s + a.evaluation_count, 0)
  check(
    '상담사 행 건수 합 == 전체 건수 (unknown 포함 — 결정 6)',
    rowSum === dash.summary.evaluation_count,
    `행 합 ${rowSum} ≠ 전체 ${dash.summary.evaluation_count}`,
  )

  // ---- ③ 각 행 vs ④ 개인 리포트 ----
  console.log('\n[③↔④] 상담사별 건수·평균·위험·약점')
  for (const row of dash.agents) {
    const report = await buildAgentReport(row.agent_id, 'all')
    if (!report) {
      failures++
      console.error(`  ✗ ${row.agent_id}: ④ 리포트 없음 (명부 누락?)`)
      continue
    }
    const mismatches: string[] = []
    if (row.evaluation_count !== report.summary.evaluation_count)
      mismatches.push(`건수 ③${row.evaluation_count}≠④${report.summary.evaluation_count}`)
    if (!eq(row.avg_score, report.summary.avg_score))
      mismatches.push(`평균 ③${row.avg_score}≠④${report.summary.avg_score}`)
    if (row.risk_count !== report.summary.risk_count)
      mismatches.push(`위험 ③${row.risk_count}≠④${report.summary.risk_count}`)
    if (!eq(row.weak_domain, report.summary.weak_domain))
      mismatches.push(
        `약점 ③${JSON.stringify(row.weak_domain)}≠④${JSON.stringify(report.summary.weak_domain)}`,
      )
    check(`${row.agent_id} (${row.agent_name})`, mismatches.length === 0, mismatches.join(', '))
  }

  // ---- ① status_labels 병기 규칙 + §10.4 케이스 ----
  console.log('\n[①] status_labels 병기 규칙 (계약 §3.3) + §10.4 필수 케이스')
  const cut = await configRepo.getNumber('low_score_cut', DEFAULT_LOW_SCORE_CUT)
  const items = await evaluations.listForDashboard({ limit: 200 })
  let labelErrors = 0
  let case104 = 0 // 정상 라벨 + risk_flagged (플래그 3·4만 건)
  let caseBoth = 0 // 병기 건 (불완전판매 의심 + 저점수)
  for (const it of items) {
    const labels = computeStatusLabels(it.status_label, Number(it.final_score), cut)
    // 병기 규칙 재검증: 저장 단일 라벨이 배열에 항상 포함돼야 함
    // (컷 변경으로 '저점수' 저장 건이 '정상'으로 재판정되는 경우는 예외 — 결정 7)
    const storedCovered =
      it.status_label === '정상'
        ? true
        : it.status_label === '저점수'
          ? labels.includes('저점수') || Number(it.final_score) >= cut
          : labels.includes(it.status_label)
    if (!storedCovered) {
      labelErrors++
      console.error(
        `    ✗ ${it.consultation_code}: 저장 라벨 '${it.status_label}'이 병기 배열 ${JSON.stringify(labels)}에 없음`,
      )
    }
    if (eq(labels, ['정상']) && Boolean(it.risk_flagged)) case104++
    if (eq(labels, ['불완전판매 의심', '저점수'])) caseBoth++
  }
  check('저장 라벨 ↔ 병기 배열 정합', labelErrors === 0, `${labelErrors}건 불일치`)
  console.log(
    `  ℹ §10.4 케이스(["정상"] + 위험 점): ${case104}건 · 병기 건(의심+저점수): ${caseBoth}건` +
      (case104 === 0 ? ' — ⚠ 시드에 §10.4 재현 건 없음 (플래그 3·4만 + 총점≥컷 건 추가 권장)' : ''),
  )

  // ---- 결과 ----
  console.log(
    failures === 0
      ? `\n✅ 정합 검증 통과 (전체 ${counts.total_count}건 · 위험 ${counts.risk_count}건 · 상담사 ${dash.summary.agent_count}명)`
      : `\n❌ 정합 검증 실패 ${failures}건`,
  )
  await pool.end()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (err) => {
  console.error('검증 실행 실패:', err instanceof Error ? err.message : String(err))
  try {
    await pool.end()
  } catch {}
  process.exit(1)
})
