/**
 * lib/db/index.ts — DB 접근 단일 진입점
 *
 *  - default export `db`: MySQL 레포 집합 (API 라우트가 사용)
 *      db.query / db.withTransaction / db.pool
 *      db.config / db.consultations / db.evaluations / db.verifyLog
 *  - named export saveResult/loadResults: 1단계 로컬 파일 저장 어댑터
 *      (lib/scoring/pipeline.ts가 사용 — MySQL 전환 완료 전까지 유지)
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import type { EvalOutput } from '../scoring/types'

import { pool, query, withTransaction } from './pool'
import * as agents from './agentRepo'
import * as agentReport from './agentReportRepo'
import * as config from './configRepo'
import * as consultations from './consultationRepo'
import * as evaluations from './evaluationRepo'
import * as reviews from './reviewRepo'
import * as verifyLog from './verifyLogRepo'

const db = {
  pool,
  query,
  withTransaction,
  agents,
  agentReport,
  config,
  consultations,
  evaluations,
  reviews,
  verifyLog,
}

export default db

// ---------------------------------------------------------------------
// 1단계 파일 저장 어댑터 (레거시 — 파이프라인 MySQL 전환 시 제거 예정)
// ---------------------------------------------------------------------

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
