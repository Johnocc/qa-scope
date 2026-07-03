/**
 * lib/db/consultationRepo.ts — 테이블 1·2 (상담 마스터 + 대화 내역)
 */
import { query, withTransaction } from './pool';
import type { ResultSetHeader } from 'mysql2/promise';

export interface MasterInput {
  consultationCode: string;
  agentId: string;
  customerId: string;
  consultedAt: string; // 'YYYY-MM-DD HH:MM:SS'
  consultationType?: string | null;
}

export interface DialogueInput {
  turnOrder: number;
  speaker: '상담사' | '고객';
  spokenAt: string;
  offsetSec?: number | null;
  content: string;
}

export interface QuoteMatch {
  ok: boolean;
  dialogueId: number | null;
  reason?: string;
}

/** 대화 코드 규칙: {상담코드}-{순서 3자리} → 예: C-2026-018442-002 */
export function buildDialogueCode(consultationCode: string, turnOrder: number): string {
  return `${consultationCode}-${String(turnOrder).padStart(3, '0')}`;
}

/**
 * 상담 1건 + 대화 내역 일괄 적재 (트랜잭션).
 * @returns consultationId
 */
export async function createConsultation(
  master: MasterInput,
  dialogues: DialogueInput[] = [],
): Promise<number> {
  return withTransaction(async (conn) => {
    const [res] = await conn.query<ResultSetHeader>(
      `INSERT INTO consultation_master
         (consultation_code, agent_id, customer_id, consulted_at, consultation_type)
       VALUES (?, ?, ?, ?, ?)`,
      [
        master.consultationCode,
        master.agentId,
        master.customerId,
        master.consultedAt,
        master.consultationType ?? null,
      ],
    );
    const consultationId = res.insertId;

    if (dialogues.length > 0) {
      const values = dialogues.map((d) => [
        buildDialogueCode(master.consultationCode, d.turnOrder),
        consultationId,
        d.turnOrder,
        d.speaker,
        d.spokenAt,
        d.offsetSec ?? null,
        d.content,
      ]);
      await conn.query(
        `INSERT INTO consultation_dialogues
           (dialogue_code, consultation_id, turn_order, speaker, spoken_at, offset_sec, content)
         VALUES ?`,
        [values],
      );
    }
    return consultationId;
  });
}

/** 상담코드(C-2026-…) 또는 내부 PK로 마스터 1행 조회 */
export async function findConsultation(idOrCode: string | number): Promise<any | null> {
  const rows = await query(
    `SELECT * FROM consultation_master
      WHERE consultation_id = ? OR consultation_code = ?
      LIMIT 1`,
    [Number(idOrCode) || 0, String(idOrCode)],
  );
  return rows[0] ?? null;
}

/** 대화 전체 조회 (채점 입력용 — 순서 보장) */
export async function getDialogues(consultationId: number): Promise<any[]> {
  return query(
    `SELECT dialogue_id, dialogue_code, turn_order, speaker, spoken_at, offset_sec, content
       FROM consultation_dialogues
      WHERE consultation_id = ?
      ORDER BY turn_order ASC`,
    [consultationId],
  );
}

/**
 * 파이프라인 ② 인용 원문 대조용 헬퍼.
 * AI가 근거로 제시한 (대화코드, 인용문)이 실제 원문과 맞는지 확인하고
 * dialogue_id를 확정한다.
 *
 * 판정:
 *  - 대화코드 존재 && 인용문이 해당 발화 content에 포함 → { ok:true, dialogueId }
 *  - 대화코드는 틀렸지만 같은 상담 다른 발화에서 인용문 발견 → { ok:false, dialogueId, reason:'…복구됨' }
 *  - 어디에서도 못 찾음 → { ok:false, dialogueId:null, reason:'환각 의심' }
 */
export async function matchQuote(
  consultationId: number,
  dialogueCode: string | null | undefined,
  quote: string,
): Promise<QuoteMatch> {
  const q = (quote || '').trim();
  if (!q) return { ok: false, dialogueId: null, reason: '빈 인용문' };

  if (dialogueCode) {
    const rows = await query<{ dialogue_id: number; content: string }>(
      `SELECT dialogue_id, content FROM consultation_dialogues
        WHERE consultation_id = ? AND dialogue_code = ? LIMIT 1`,
      [consultationId, String(dialogueCode)],
    );
    if (rows[0] && rows[0].content.includes(q)) {
      return { ok: true, dialogueId: rows[0].dialogue_id };
    }
  }
  // 코드 매칭 실패 → 상담 전체에서 인용문 탐색 (복구 시도)
  const found = await query<{ dialogue_id: number }>(
    `SELECT dialogue_id FROM consultation_dialogues
      WHERE consultation_id = ? AND content LIKE CONCAT('%', ?, '%')
      ORDER BY turn_order ASC LIMIT 1`,
    [consultationId, q],
  );
  if (found[0]) {
    return { ok: false, dialogueId: found[0].dialogue_id, reason: '대화ID 불일치(인용문 자체는 원문에 존재 — 복구됨)' };
  }
  return { ok: false, dialogueId: null, reason: '인용문 원문 미존재(환각 의심)' };
}
