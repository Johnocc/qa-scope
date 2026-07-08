import 'dotenv/config'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { scoreConsultation } from '../lib/scoring/pipeline.ts'

const DUMMIES = ['dummy_01', 'dummy_02', 'dummy_03', 'dummy_04', 'dummy_05', 'dummy_06', 'dummy_07']

async function main() {
  const transcriptDir = join(process.cwd(), 'test/golden/transcripts')
  const outputDir = join(process.cwd(), 'outputs')
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true })

  const failures: { id: string; error: string }[] = []

  for (const id of DUMMIES) {
    const inputPath = join(transcriptDir, `${id}.txt`)
    const outputPath = join(outputDir, `${id}.json`)
    console.log(`\n채점 시작: ${id}`)
    try {
      const rawText = readFileSync(inputPath, 'utf-8')
      const result = await scoreConsultation(id, rawText)
      writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8')
      console.log(`  ✓ 완료: 환산총점=${result.집계.환산총점}  상태=${result.집계.상태라벨}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ✗ 실패: ${msg}`)
      failures.push({ id, error: msg })
    }
  }

  console.log('\n==============================')
  if (failures.length === 0) {
    console.log(`전체 ${DUMMIES.length}건 채점 완료. 실패 없음.`)
  } else {
    console.log(`완료: ${DUMMIES.length - failures.length}건 / 실패: ${failures.length}건`)
    console.log('\n[실패 목록]')
    for (const f of failures) {
      console.log(`  ${f.id}: ${f.error}`)
    }
    process.exitCode = 1
  }
  console.log('==============================')
}

main()
