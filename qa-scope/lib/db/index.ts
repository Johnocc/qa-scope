import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import type { EvalOutput } from '../scoring/types'

function getResultsDir(): string {
  return process.env.RESULTS_DIR ?? './results'
}

// 상담ID에서 파일시스템 불가 문자를 제거
function toFilename(consultationId: string | number): string {
  return String(consultationId).replace(/[/\\:*?"<>|]/g, '_') + '.json'
}

export async function saveResult(result: EvalOutput): Promise<void> {
  const dir = getResultsDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const filepath = join(dir, toFilename(result.상담ID))
  writeFileSync(filepath, JSON.stringify(result, null, 2), 'utf-8')
}

export async function loadResults(): Promise<EvalOutput[]> {
  const dir = getResultsDir()
  if (!existsSync(dir)) return []

  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')) as EvalOutput)
}
