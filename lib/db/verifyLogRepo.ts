/**
 * lib/db/verifyLogRepo.ts — 테이블 3-E (파이프라인 검증 로그)
 *
 * 파이프라인 흐름과의 대응:
 *   시도 n 시작 → 채점 LLM 호출 → logStage(형식검증) → logStage(인용대조)
 *   → logStage(교차검증) → 전부 통과 시 evaluationRepo.saveFinalEvaluation()
 *   → linkEvaluation(consultationId, n, evaluationId) 로 로그 역연결.
 *   어느 단계든 실패하면 그 시도는 3-A에 행을 만들지 않고 재시도(n+1).
 */
import { pool, query } from './pool';
import type { ResultSetHeader } from 'mysql2/promise';

export interface StageLog {
  consultationId: number;
  attemptNo: number;
  stage: '형식검증' | '인용대조' | '교차검증';
  checker: '코드' | 'LLM';
  checkerModel?: string | null;
  passed: boolean;
  issues?: string | string[] | null;
  candidateJson?: unknown;
}

/** 검증 단계 1건 기록. */
export async function logStage(p: StageLog): Promise<number> {
  const issuesText = Array.isArray(p.issues) ? p.issues.join('\n') : (p.issues ?? null);
  const [res] = await pool.query<ResultSetHeader>(
    `INSERT INTO ai_evaluation_verify_log
       (consultation_id, attempt_no, stage, checker, checker_model, passed, issues, candidate_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      p.consultationId, p.attemptNo, p.stage,
      p.checker, p.checkerModel ?? null,
      Number(Boolean(p.passed)),
      issuesText,
      p.candidateJson ? JSON.stringify(p.candidateJson) : null,
    ],
  );
  return res.insertId;
}

/** 최종 통과본 저장 후, 해당 시도의 로그 행들에 evaluation_id 역연결 */
export async function linkEvaluation(
  consultationId: number,
  attemptNo: number,
  evaluationId: number,
): Promise<void> {
  await query(
    `UPDATE ai_evaluation_verify_log
        SET evaluation_id = ?
      WHERE consultation_id = ? AND attempt_no = ?`,
    [evaluationId, consultationId, attemptNo],
  );
}

/** 특정 상담의 전체 검증 이력 (재시도 원인 추적용) */
export async function getHistory(consultationId: number): Promise<any[]> {
  return query(
    `SELECT attempt_no, stage, checker, checker_model, passed, issues, created_at
       FROM ai_evaluation_verify_log
      WHERE consultation_id = ?
      ORDER BY attempt_no ASC, FIELD(stage, '형식검증', '인용대조', '교차검증')`,
    [consultationId],
  );
}
