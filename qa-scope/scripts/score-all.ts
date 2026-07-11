import 'dotenv/config'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { scoreConsultation } from '../lib/scoring/pipeline.ts'
import { findConsultation } from '../lib/db/consultationRepo.ts'
import { hasConfirmedReview } from '../lib/db/reviewRepo.ts'
import { pool } from '../lib/db/pool.ts'

const DUMMIES = ['dummy_01', 'dummy_02', 'dummy_03', 'dummy_04', 'dummy_05', 'dummy_06', 'dummy_07']

/**
 * 전건 배치 재채점.
 *
 * 확정 검수 안전장치 (계약 결정 3-A — docs/api/검수_쓰기_API계약_v1.md):
 *  - 기본: 확정 검수가 걸린 상담은 **채점 시작 전** hasConfirmedReview로 사전 조회해
 *    건너뛴다. LLM을 아예 호출하지 않아 비용 낭비가 없다(1차 방어선). saveFinalEvaluation의
 *    저장 시점 skip은 배치 외 진입 경로용 최후 방어선으로 별도 유지된다.
 *  - --force: 사전 스킵을 건너뛰고 재채점한다. 검수 전문은 saveFinalEvaluation이
 *    3-E '검수폐기'로 보존한 뒤 폐기한다(보존 없는 삭제 없음). RAG 교체·프롬프트 보강 등
 *    확정 판정까지 새로 돌려야 할 때만 의도적으로 사용.
 */
async function main() {
  const force = process.argv.includes('--force')

  const transcriptDir = join(process.cwd(), 'test/golden/transcripts')
  const outputDir = join(process.cwd(), 'outputs')
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true })

  if (force) {
    console.log('⚠ --force: 확정 검수 건도 재채점합니다 (검수는 3-E 검수폐기로 보존 후 폐기).')
  }

  const failures: { id: string; error: string }[] = []
  const skipped: string[] = []
  let completed = 0

  for (const id of DUMMIES) {
    const inputPath = join(transcriptDir, `${id}.txt`)
    const outputPath = join(outputDir, `${id}.json`)

    // 확정 검수 존재 건은 채점 시작 전 사전 조회로 스킵 (LLM 미호출 — 계약 결정 3-A).
    // 최초 채점(상담 미적재)이거나 검수중/검수없음은 스킵 대상 아님.
    if (!force) {
      const existing = await findConsultation(id)
      if (existing && (await hasConfirmedReview(existing.consultation_id, 'AI_최종'))) {
        console.log(`\n스킵: ${id} — 확정 검수 존재 (재채점하려면 --force)`)
        skipped.push(id)
        continue
      }
    }

    console.log(`\n채점 시작: ${id}`)
    try {
      const rawText = readFileSync(inputPath, 'utf-8')
      const result = await scoreConsultation(id, rawText, {
        onConfirmedReview: force ? 'force' : 'skip',
      })
      writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8')
      console.log(`  ✓ 완료: 환산총점=${result.집계.환산총점}  상태=${result.집계.상태라벨}`)
      completed++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ✗ 실패: ${msg}`)
      failures.push({ id, error: msg })
    }
  }

  console.log('\n==============================')
  console.log(
    `완료 ${completed}건 / 확정 검수로 스킵 ${skipped.length}건 / 실패 ${failures.length}건 ` +
      `(전체 ${DUMMIES.length}건)`,
  )
  if (skipped.length > 0) {
    console.log(`[확정 검수로 스킵] ${skipped.join(', ')}`)
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
  .finally(() => pool.end())
