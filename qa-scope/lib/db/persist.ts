/**
 * lib/db/persist.ts — 채점 결과 MySQL 적재 어댑터
 *
 * 파이프라인 최종 산출물(EvalOutput)과 파싱된 발화 배열을 받아:
 *  ① 상담 마스터 + 대화 내역 적재 (이미 있으면 재사용)
 *  ② 근거 인용문을 원문과 대조해 dialogue_id 확정 (안전망 2 — matchQuote)
 *  ③ saveFinalEvaluation 트랜잭션 저장 (집계는 그 안에서 재계산)
 *
 * 재채점 정책(MVP): 같은 상담의 기존 AI_최종 평가는 삭제 후 새로 저장.
 * (UNIQUE(consultation_id, evaluator) — 상담당 AI 최종본 1건 유지)
 */
import { query } from './pool'
import { ensureAgent } from './agentRepo'
import * as consultations from './consultationRepo'
import { buildDialogueCode } from './consultationRepo'
import { saveFinalEvaluation } from './evaluationRepo'
import type { EvalOutput, Utterance } from '../scoring/types'

function toSqlDatetime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

/** 파서의 utteranceId("U07") → 대화순서(7). 형식이 다르면 null */
function utteranceIdToTurn(id: string | number): number | null {
  const m = String(id).match(/^U(\d+)$/i)
  return m ? parseInt(m[1], 10) : null
}

export interface PersistResult {
  consultationId: number
  evaluationId: number
  /** 원문 대조에 실패한(환각 의심) 근거 목록 — 로그·검토용 */
  unmatchedQuotes: { 항목코드: string; 대화ID: string | number; reason: string }[]
}

export async function persistEvaluation(
  상담ID: string | number,
  utterances: Utterance[],
  final: EvalOutput,
): Promise<PersistResult> {
  const code = String(상담ID)

  // ① 상담 + 대화 적재 (이미 적재된 상담이면 재사용)
  const existing = await consultations.findConsultation(code)
  let consultationId: number
  if (existing) {
    consultationId = existing.consultation_id
  } else {
    const base = new Date()
    // v3: agent_id가 agents FK — 미배정 행이 명부에 없으면(수동 삭제 등) 복구
    await ensureAgent('unknown', '미배정')
    consultationId = await consultations.createConsultation(
      {
        consultationCode: code,
        // 더미 transcript에는 상담사·고객 식별자가 없다 — 실데이터 연동 시 채움
        agentId: 'unknown',
        customerId: 'unknown',
        consultedAt: toSqlDatetime(base),
      },
      utterances.map((u, i) => ({
        turnOrder: i + 1,
        speaker: u.화자,
        spokenAt: toSqlDatetime(new Date(base.getTime() + u.타임스탬프 * 1000)),
        offsetSec: u.타임스탬프,
        content: u.대화내용,
      })),
    )
  }

  // ② 근거 인용 원문대조 → dialogue_id 확정 ("점수 클릭→원문 점프" 연결고리)
  const evidenceDialogueIds = new Map<string, number>()
  const unmatchedQuotes: PersistResult['unmatchedQuotes'] = []
  for (const item of final.항목평가) {
    const evidences = Array.isArray(item.근거) ? item.근거 : []
    for (let idx = 0; idx < evidences.length; idx++) {
      const ev = evidences[idx]
      const turn = utteranceIdToTurn(ev.대화ID)
      const dialogueCode = turn === null ? null : buildDialogueCode(code, turn)
      const match = await consultations.matchQuote(consultationId, dialogueCode, ev.인용문)
      if (match.dialogueId !== null) {
        evidenceDialogueIds.set(`${item.항목코드}|${idx}`, match.dialogueId)
      }
      if (!match.ok) {
        unmatchedQuotes.push({
          항목코드: item.항목코드,
          대화ID: ev.대화ID,
          reason: match.reason ?? '불일치',
        })
      }
    }
  }

  // ③ 재채점이면 기존 AI 최종본 교체 (상세·근거·플래그는 FK CASCADE로 함께 삭제)
  await query(
    `DELETE FROM ai_evaluation_master WHERE consultation_id = ? AND evaluator = 'AI_최종'`,
    [consultationId],
  )

  const evaluationId = await saveFinalEvaluation(consultationId, final, {
    evaluator: 'AI_최종',
    aiModel: final.평가메타?.AI모델 ?? null,
    rubricVersion: final.평가메타?.루브릭버전 ?? 'v1.5',
    evidenceDialogueIds,
  })

  return { consultationId, evaluationId, unmatchedQuotes }
}
