/**
 * scripts/seed.ts — 더미 상담 7건 시드 (상담 마스터 + 대화 내역 + 기존 채점 결과)
 *
 * 사용:
 *   npm run db:seed                      # 기본 시드
 *   npx tsx scripts/seed.ts --reset      # 7건 삭제 후 재시드 (⚠ 연결된 평가도 CASCADE 삭제)
 *   npx tsx scripts/seed.ts --no-eval    # 상담만 적재, outputs/ 평가 적재 생략
 *
 * 동작:
 *  ① test/golden/transcripts/dummy_0N.txt 를 파싱해 상담 + 대화 내역 적재.
 *     - 상담이 이미 있으면 마스터 메타데이터(상담사·고객·일시·유형)만 UPDATE
 *       하고 기존 평가 결과는 보존한다. (초기 채점 때 agent_id='unknown'으로
 *       들어간 행을 데이터 손실 없이 바로잡는 용도)
 *     - 대화 spoken_at은 새 상담일시 + offset_sec 으로 재계산.
 *  ② outputs/dummy_0N.json 이 있으면 스키마 검증 후 평가 결과까지 적재.
 *
 * 상담코드는 채점 스크립트(score-one.ts)의 상담ID = 파일명 규칙과 동일하게
 * 'dummy_0N'을 쓴다 → 시드 후 채점을 돌리면 persistEvaluation이 이 상담을
 * 재사용하므로 상담사·일시 정보가 유지된다.
 */
import 'dotenv/config'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { parseTranscript } from '../lib/scoring/parse.ts'
import { validateOutput } from '../lib/scoring/validate.ts'
import { persistEvaluation } from '../lib/db/persist.ts'
import { upsertAgents, type AgentInput } from '../lib/db/agentRepo.ts'
import * as consultations from '../lib/db/consultationRepo.ts'
import { buildDialogueCode } from '../lib/db/consultationRepo.ts'
import { pool, query } from '../lib/db/pool.ts'
import type { EvalOutput, Utterance } from '../lib/scoring/types.ts'

const TRANSCRIPT_DIR = join(process.cwd(), 'test', 'golden', 'transcripts')
const OUTPUT_DIR = join(process.cwd(), 'outputs')

type ConsultationType = '신규·보장' | '계약변경' | '해지·환급' | '보험금청구' | '단순문의'

interface SeedRow {
  code: string
  fileKey: string
  agentId: string
  customerId: string
  consultedAt: string // 'YYYY-MM-DD HH:MM:SS'
  type: ConsultationType
}

/**
 * 상담사 명부 (v3: agents 테이블 — consultation_master.agent_id의 FK 대상).
 * 이름은 더미 원문 첫 발화에서 상담사가 스스로 밝힌 이름 기준.
 * 상담 적재 전에 반드시 먼저 upsert (FK 제약).
 * 'unknown'(미배정)은 schema.sql 시드 + persist.ts ensureAgent가 보장하므로 여기 없음.
 */
const AGENT_ROWS: AgentInput[] = [
  { agentId: 'AGT-001', agentName: '이지현' },
  { agentId: 'AGT-002', agentName: '이준호' },
  { agentId: 'AGT-003', agentName: '박소영' },
  { agentId: 'AGT-004', agentName: '정유나' },
  { agentId: 'AGT-005', agentName: '한지원' },
  { agentId: 'AGT-006', agentName: '김도연' },
]

/**
 * 상담사 배정: dummy_06은 원문에 상담사 이름이 없어(인사 생략 상담) AGT-002에 배정
 * → 상담사 1명이 2건을 갖게 되어 대시보드 평균·집계 화면 검증에 쓸 수 있다.
 * 상담유형은 골든셋 기록표의 유형 라벨(우수/미흡 품질 라벨은 제외 — §13)을 따름.
 * 고객은 개인정보를 저장하지 않고 식별자만 부여한다.
 */
const SEED_ROWS: SeedRow[] = [
  { code: 'CS-20260622-0940', fileKey: 'dummy_01', agentId: 'AGT-001', customerId: 'CUST-1001', consultedAt: '2026-06-22 09:40:00', type: '신규·보장' },
  { code: 'CS-20260623-1415', fileKey: 'dummy_02', agentId: 'AGT-002', customerId: 'CUST-1002', consultedAt: '2026-06-23 14:15:00', type: '신규·보장' },
  { code: 'CS-20260624-1105', fileKey: 'dummy_03', agentId: 'AGT-003', customerId: 'CUST-1003', consultedAt: '2026-06-24 11:05:00', type: '해지·환급' },
  { code: 'CS-20260625-1630', fileKey: 'dummy_04', agentId: 'AGT-004', customerId: 'CUST-1004', consultedAt: '2026-06-25 16:30:00', type: '보험금청구' },
  { code: 'CS-20260626-1020', fileKey: 'dummy_05', agentId: 'AGT-005', customerId: 'CUST-1005', consultedAt: '2026-06-26 10:20:00', type: '계약변경' },
  { code: 'CS-20260629-1350', fileKey: 'dummy_06', agentId: 'AGT-002', customerId: 'CUST-1006', consultedAt: '2026-06-29 13:50:00', type: '단순문의' },
  { code: 'CS-20260630-1510', fileKey: 'dummy_07', agentId: 'AGT-006', customerId: 'CUST-1007', consultedAt: '2026-06-30 15:10:00', type: '신규·보장' },
]

function addSeconds(base: string, offsetSec: number): string {
  const d = new Date(base.replace(' ', 'T'))
  d.setSeconds(d.getSeconds() + offsetSec)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

function toDialogueInputs(row: SeedRow, utterances: Utterance[]) {
  return utterances.map((u, i) => ({
    turnOrder: i + 1,
    speaker: u.화자,
    spokenAt: addSeconds(row.consultedAt, u.타임스탬프),
    offsetSec: u.타임스탬프,
    content: u.대화내용,
  }))
}

async function insertDialogues(consultationId: number, row: SeedRow, utterances: Utterance[]) {
  const values = toDialogueInputs(row, utterances).map((d) => [
    buildDialogueCode(row.code, d.turnOrder),
    consultationId,
    d.turnOrder,
    d.speaker,
    d.spokenAt,
    d.offsetSec,
    d.content,
  ])
  await query(
    `INSERT INTO consultation_dialogues
       (dialogue_code, consultation_id, turn_order, speaker, spoken_at, offset_sec, content)
     VALUES ?`,
    [values] as any,
  )
}

async function seedOne(row: SeedRow, opts: { reset: boolean; withEval: boolean }) {
  const transcriptPath = join(TRANSCRIPT_DIR, `${row.fileKey}.txt`)
  if (!existsSync(transcriptPath)) {
    console.warn(`⚠ ${row.code}: transcript 없음 (${transcriptPath}) — 건너뜀`)
    return { consultation: 'skipped' as const, evaluation: 'skipped' as const }
  }

  const { utterances, droppedLines } = parseTranscript(readFileSync(transcriptPath, 'utf-8'))
  if (droppedLines.length > 0) {
    console.warn(`⚠ ${row.code}: 파싱에서 버려진 행 ${droppedLines.length}개 (형식 확인 필요)`)
  }

  let existing = await consultations.findConsultation(row.code)

  if (existing && opts.reset) {
    // CASCADE로 대화·평가·검증로그까지 함께 삭제된다
    await query(`DELETE FROM consultation_master WHERE consultation_id = ?`, [existing.consultation_id])
    console.log(`  ${row.code}: --reset — 기존 상담(및 연결 평가) 삭제`)
    existing = null
  }

  let consultationId: number
  let consultationResult: 'created' | 'updated'

  if (existing) {
    consultationId = existing.consultation_id
    // 메타데이터만 갱신 — 기존 평가 결과는 보존
    await query(
      `UPDATE consultation_master
          SET agent_id = ?, customer_id = ?, consulted_at = ?, consultation_type = ?
        WHERE consultation_id = ?`,
      [row.agentId, row.customerId, row.consultedAt, row.type, consultationId],
    )
    // spoken_at을 새 상담일시 기준으로 재계산
    await query(
      `UPDATE consultation_dialogues
          SET spoken_at = DATE_ADD(?, INTERVAL COALESCE(offset_sec, 0) SECOND)
        WHERE consultation_id = ?`,
      [row.consultedAt, consultationId],
    )
    const dialogues = await consultations.getDialogues(consultationId)
    if (dialogues.length === 0) {
      await insertDialogues(consultationId, row, utterances)
      console.log(`  ${row.code}: 대화 내역 없음 → ${utterances.length}건 삽입`)
    } else if (dialogues.length !== utterances.length) {
      console.warn(
        `⚠ ${row.code}: DB 대화 ${dialogues.length}건 ≠ transcript ${utterances.length}건 — ` +
          `원문이 바뀐 듯하면 --reset으로 재시드 필요`,
      )
    }
    consultationResult = 'updated'
  } else {
    consultationId = await consultations.createConsultation(
      {
        consultationCode: row.code,
        agentId: row.agentId,
        customerId: row.customerId,
        consultedAt: row.consultedAt,
        consultationType: row.type,
      },
      toDialogueInputs(row, utterances),
    )
    consultationResult = 'created'
  }

  // outputs/의 기존 채점 결과가 있으면 평가까지 적재
  let evaluationResult: 'persisted' | 'skipped' | 'invalid' = 'skipped'
  const jsonPath = join(OUTPUT_DIR, `${row.fileKey}.json`)
  if (opts.withEval && existsSync(jsonPath)) {
    const result = JSON.parse(readFileSync(jsonPath, 'utf-8')) as EvalOutput
    if (String(result.상담ID) !== row.fileKey) {
      console.warn(`⚠ ${row.code}: outputs JSON의 상담ID='${result.상담ID}' 불일치 — 평가 적재 생략`)
      evaluationResult = 'invalid'
    } else {
      const validation = validateOutput(result)
      if (!validation.valid) {
        console.warn(`⚠ ${row.code}: outputs JSON 스키마 검증 실패 — 평가 적재 생략`)
        evaluationResult = 'invalid'
      } else {
        const persisted = await persistEvaluation(row.code, utterances, result)
        if (persisted.unmatchedQuotes.length > 0) {
          console.warn(
            `⚠ ${row.code}: 인용 원문대조 불일치 ${persisted.unmatchedQuotes.length}건`,
            persisted.unmatchedQuotes,
          )
        }
        evaluationResult = 'persisted'
      }
    }
  }

  const evalLabel =
    evaluationResult === 'persisted' ? '평가 적재' : evaluationResult === 'invalid' ? '평가 검증실패' : '평가 없음'
  console.log(
    `✓ ${row.code}: 상담 ${consultationResult === 'created' ? '신규' : '갱신'} ` +
      `(id=${consultationId}, ${row.agentId}, ${row.type}, 발화 ${utterances.length}건) · ${evalLabel}`,
  )
  return { consultation: consultationResult, evaluation: evaluationResult }
}

async function main() {
  const argv = process.argv.slice(2)
  const opts = { reset: argv.includes('--reset'), withEval: !argv.includes('--no-eval') }

  if (opts.reset) {
    console.log('⚠ --reset: 시드 대상 상담의 기존 데이터(평가 포함)를 삭제 후 재적재합니다.\n')
  }

  // 상담사 명부 먼저 — consultation_master.agent_id FK 대상 (v3)
  await upsertAgents(AGENT_ROWS)
  console.log(`✓ 상담사 명부 ${AGENT_ROWS.length}명 upsert\n`)

  const summary = { created: 0, updated: 0, evalPersisted: 0 }
  for (const row of SEED_ROWS) {
    const r = await seedOne(row, opts)
    if (r.consultation === 'created') summary.created++
    if (r.consultation === 'updated') summary.updated++
    if (r.evaluation === 'persisted') summary.evalPersisted++
  }

  console.log(
    `\n완료: 상담 신규 ${summary.created}건 · 갱신 ${summary.updated}건 · 평가 적재 ${summary.evalPersisted}건`,
  )
  await pool.end()
}

main().catch((err) => {
  console.error('시드 실패:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
