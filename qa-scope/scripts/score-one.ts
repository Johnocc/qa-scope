import 'dotenv/config'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, basename, extname } from 'path'
import { scoreConsultation } from '../lib/scoring/pipeline.ts'

async function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('사용법: node --experimental-strip-types scripts/score-one.ts <파일경로>')
    console.error('예시: node --experimental-strip-types scripts/score-one.ts test/golden/transcripts/dummy_01.txt')
    process.exit(1)
  }

  const rawText = readFileSync(filePath, 'utf-8')
  const 상담ID = basename(filePath, extname(filePath))

  console.log(`채점 시작: ${상담ID}\n`)

  try {
    const result = await scoreConsultation(상담ID, rawText)

    const json = JSON.stringify(result, null, 2)
    console.log(json)

    const outputDir = join(process.cwd(), 'outputs')
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true })
    const outputPath = join(outputDir, `${상담ID}.json`)
    writeFileSync(outputPath, json, 'utf-8')

    console.log(`\n✓ 저장 완료: ${outputPath}`)
    console.log(`  상태라벨: ${result.집계.상태라벨}`)
    console.log(`  환산총점: ${result.집계.환산총점}`)
    console.log(`  위험표시: ${result.집계.위험표시여부}`)
  } catch (err) {
    console.error('\n채점 실패:', err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  }
}

main()
