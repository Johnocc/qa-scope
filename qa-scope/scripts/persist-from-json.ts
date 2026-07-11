/**
 * scripts/persist-from-json.ts — 저장된 채점 JSON을 MySQL에 (재)적재
 *
 * 사용: npx tsx scripts/persist-from-json.ts <채점JSON> <transcript> [--force-reviewed]
 * 예시: npx tsx scripts/persist-from-json.ts outputs/dummy_01.json test/golden/transcripts/dummy_01.txt
 *
 * 용도: LLM 재호출 없이 outputs/의 기존 결과를 DB에 넣거나,
 *       스키마 재구축 후 결과를 일괄 재적재할 때.
 * 확정 검수 존재 건은 기본 스킵(안내 후 중단) — --force-reviewed 명시 시에만
 * 덮어쓰기 (검수는 3-E '검수폐기'로 보존, 검수 계약 결정 3).
 */
import 'dotenv/config'
import { readFileSync } from 'fs'
import { parseTranscript } from '../lib/scoring/parse.ts'
import { validateOutput } from '../lib/scoring/validate.ts'
import { persistEvaluation } from '../lib/db/persist.ts'
import { ConfirmedReviewSkipError } from '../lib/db/evaluationRepo.ts'
import { pool } from '../lib/db/pool.ts'
import type { EvalOutput } from '../lib/scoring/types.ts'

async function main() {
  const args = process.argv.slice(2)
  const forceReviewed = args.includes('--force-reviewed')
  const [jsonPath, transcriptPath] = args.filter((a) => a !== '--force-reviewed')
  if (!jsonPath || !transcriptPath) {
    console.error('사용법: npx tsx scripts/persist-from-json.ts <채점JSON> <transcript> [--force-reviewed]')
    process.exit(1)
  }

  const result = JSON.parse(readFileSync(jsonPath, 'utf-8')) as EvalOutput
  const validation = validateOutput(result)
  if (!validation.valid) {
    console.error('스키마 검증 실패 — 적재 중단:', JSON.stringify(validation.errors, null, 2))
    process.exit(1)
  }

  const { utterances } = parseTranscript(readFileSync(transcriptPath, 'utf-8'))
  const persisted = await persistEvaluation(result.상담ID, utterances, result, {
    onConfirmedReview: forceReviewed ? 'force' : 'skip',
  })

  if (persisted.unmatchedQuotes.length > 0) {
    console.warn(`⚠ 인용 원문대조 불일치 ${persisted.unmatchedQuotes.length}건:`, persisted.unmatchedQuotes)
  }
  console.log(`✓ MySQL 적재 완료: consultation_id=${persisted.consultationId}, evaluation_id=${persisted.evaluationId}`)

  await pool.end()
}

main().catch((err) => {
  // 확정 검수 스킵은 안전장치의 정상 동작 — '적재 실패'로 오표기하지 않는다
  if (err instanceof ConfirmedReviewSkipError) {
    console.log(`↷ 적재 스킵: ${err.message}`)
    pool.end().finally(() => process.exit(0))
    return
  }
  console.error('적재 실패:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
