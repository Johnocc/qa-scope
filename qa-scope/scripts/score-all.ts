import 'dotenv/config'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { scoreConsultation } from '../lib/scoring/pipeline.ts'
import * as consultations from '../lib/db/consultationRepo.ts'
import * as reviewRepo from '../lib/db/reviewRepo.ts'
import { ConfirmedReviewSkipError } from '../lib/db/evaluationRepo.ts'
import { pool } from '../lib/db/pool.ts'

const DUMMIES = ['dummy_01', 'dummy_02', 'dummy_03', 'dummy_04', 'dummy_05', 'dummy_06', 'dummy_07']

// 확정 검수 존재 건 재채점 정책 (검수_쓰기_API계약_v1.md 결정 3):
// 기본 = 채점 시작 전 사전 조회로 스킵 (LLM 호출 자체를 생략).
// --force-reviewed 명시 시에만 덮어쓰기 (검수는 3-E '검수폐기'로 보존됨).
const forceReviewed = process.argv.includes('--force-reviewed')

async function main() {
  const transcriptDir = join(process.cwd(), 'test/golden/transcripts')
  const outputDir = join(process.cwd(), 'outputs')
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true })

  const failures: { id: string; error: string }[] = []
  const skipped: string[] = []

  for (const id of DUMMIES) {
    const inputPath = join(transcriptDir, `${id}.txt`)
    const outputPath = join(outputDir, `${id}.json`)

    // 확정 검수 사전 스킵 — LLM 호출 전에 판정 (비용 낭비 방지)
    if (!forceReviewed) {
      const existing = await consultations.findConsultation(id)
      if (existing && (await reviewRepo.hasConfirmedReview(existing.consultation_id))) {
        console.log(`\n↷ 스킵: ${id} — 확정 검수 존재 (강제 재채점: --force-reviewed)`)
        skipped.push(id)
        continue
      }
    }

    console.log(`\n채점 시작: ${id}`)
    try {
      const rawText = readFileSync(inputPath, 'utf-8')
      const result = await scoreConsultation(id, rawText, {
        onConfirmedReview: forceReviewed ? 'force' : 'skip',
      })
      writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8')
      console.log(`  ✓ 완료: 환산총점=${result.집계.환산총점}  상태=${result.집계.상태라벨}`)
    } catch (err) {
      // 저장 시점 최후 방어선 — 사전 조회와 저장 사이에 검수가 확정된 경합 케이스
      if (err instanceof ConfirmedReviewSkipError) {
        console.log(`  ↷ 스킵(저장 시점): ${id} — ${err.message}`)
        skipped.push(id)
        continue
      }
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ✗ 실패: ${msg}`)
      failures.push({ id, error: msg })
    }
  }

  console.log('\n==============================')
  const done = DUMMIES.length - failures.length - skipped.length
  console.log(`채점 ${done}건 완료 / 확정 검수로 스킵 ${skipped.length}건 / 실패 ${failures.length}건`)
  if (skipped.length > 0) {
    console.log(`[스킵 목록] ${skipped.join(', ')} — 강제 재채점은 --force-reviewed`)
  }
  if (failures.length > 0) {
    console.log('\n[실패 목록]')
    for (const f of failures) {
      console.log(`  ${f.id}: ${f.error}`)
    }
    process.exitCode = 1
  }
  console.log('==============================')
}

main()
  .catch((err) => {
    console.error('배치 실패:', err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  })
  .finally(() => pool.end()) // 사전 조회로 pool이 열림 — 종료 안 하면 프로세스가 안 끝난다
