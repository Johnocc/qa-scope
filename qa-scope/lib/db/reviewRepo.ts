/**
 * lib/db/reviewRepo.ts — 테이블 3-F(evaluation_reviews)·3-G(evaluation_review_overrides)
 *
 * 정본 계약: docs/api/검수_쓰기_API계약_v1.md (2026-07-10 확정)
 *
 * 원칙 (계약 §0·§2 Do NOT):
 *  - AI 원본 불변 — 검수는 3-A/3-B를 UPDATE하지 않고 이 레이어에 얹는다.
 *    compare-golden 등 검증 경로는 3-F/3-G를 참조하지 않는다.
 *  - 사람도 점수를 직접 입력하지 않는다 — 수정 단위는 충족수준(4택).
 *    유효 집계는 saveFinalEvaluation과 같은 computeAggregates로 재계산해
 *    3-F에 물질화한다 (별도 산식 금지, 컷은 저장 시점 app_config).
 *  - 3-F 행이 지워지는 모든 경로(철회 · force 재채점 · 검수중 건 재채점)는
 *    삭제 직전 3-E stage='검수폐기'로 검수 전문을 보존한다 — 보존 없는 삭제 금지.
 *    철회는 deleteReview()가 직접 처리하고, 재채점 쪽은 saveFinalEvaluation이
 *    기존 정본 DELETE 직전에 preserveReviewOnConn()을 같은 트랜잭션에서 호출하면 된다.
 *  - 확정(review_status='확정') 검수 존재 건은 배치 재채점 기본 스킵 —
 *    score-all 등 배치는 채점 시작 전에 hasConfirmedReview()로 판정한다 (계약 결정 3).
 */
import { query, withTransaction } from './pool';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { computeAggregates } from '../scoring/scoring';
import { deriveCodeFlags } from '../scoring/calculate';
import { ITEM_CODES, LEVELS, type ItemCode, type Level } from '../scoring/constants';
import * as configRepo from './configRepo';
import { computeStatusLabels, DEFAULT_LOW_SCORE_CUT } from './statusLabels';
import type { ReviewHistoryEntry } from '../types/evaluation';

export interface OverrideInput {
  item_code: ItemCode;
  level_override: Level;
  override_reason?: string | null;
}

export interface UpsertReviewInput {
  review_status: '검수중' | '확정';
  reviewer: string;
  review_comment?: string | null;
  /** 쓰기 v1에서 개방 — 요청 본문이 전체 상태 (전삭제 후 재삽입, 계약 §3.1 ④) */
  overrides?: OverrideInput[];
}

/** 요청 본문 오류 (계약 §3.1 ② → 라우트에서 400으로 매핑) */
export class ReviewValidationError extends Error {
  constructor(public issues: string[]) {
    super(issues.join(' / '));
    this.name = 'ReviewValidationError';
  }
}

/** overrides 검증 — 항목코드·4택 ENUM·중복 (계약 §3.1 ②) */
export function validateOverrides(overrides: OverrideInput[]): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const ov of overrides) {
    if (!(ITEM_CODES as readonly string[]).includes(ov.item_code)) {
      issues.push(`알 수 없는 항목코드: ${ov.item_code}`);
      continue;
    }
    if (seen.has(ov.item_code)) issues.push(`항목코드 중복: ${ov.item_code}`);
    seen.add(ov.item_code);
    if (!(LEVELS as readonly string[]).includes(ov.level_override)) {
      issues.push(`${ov.item_code} 충족수준 값 이상: ${ov.level_override}`);
    }
  }
  return issues;
}

/**
 * 검수 업서트 (계약 §3.1 — PUT의 심장).
 * 처리 순서: ① 대상 평가 존재 확인 → ② overrides 검증 → ③ 유효 집계 재계산
 * → ④ 3-F 업서트 + 3-G 교체 (한 트랜잭션).
 * 상태 전이: '확정 → 검수중' 되돌림(확정 해제)도 허용 — 내용 보존, 스킵 보호만 해제.
 *
 * @returns 저장된 검수 블록 (계약 §3.1 응답 형태) / 평가 없음 → null (라우트 404)
 * @throws ReviewValidationError overrides 오류 (라우트 400)
 */
export async function upsertReview(
  evaluationId: number,
  input: UpsertReviewInput,
): Promise<any | null> {
  const overrides = input.overrides ?? [];

  // ② overrides 검증 (①보다 싼 검사 먼저 — DB 왕복 없음)
  const issues = validateOverrides(overrides);
  if (issues.length > 0) throw new ReviewValidationError(issues);

  // ① 대상 평가 + AI 판정(3-B)·위험플래그(3-C) 로드 — 유효 집계의 입력
  const details = await query<{ item_code: ItemCode; level: Level }>(
    `SELECT item_code, level FROM ai_evaluation_details WHERE evaluation_id = ?`,
    [evaluationId],
  );
  if (details.length === 0) return null; // 평가 없음 (18항목 규약상 존재하면 0행일 수 없음)

  const flags = await query<{ rule_number: number }>(
    `SELECT rule_number FROM ai_evaluation_risk_flags WHERE evaluation_id = ?`,
    [evaluationId],
  );

  const masterRows = await query<{ matching_verdict: string | null }>(
    `SELECT matching_verdict FROM ai_evaluation_master WHERE evaluation_id = ?`,
    [evaluationId],
  );
  const matchingVerdict = masterRows[0]?.matching_verdict ?? undefined;

  // ③ 유효 집계 — AI 판정에 override를 얹어 computeAggregates 재계산 (별도 산식 금지).
  //    위험플래그는 AI 원본에 규칙 1·3·6 코드 파생을 더한다 — calcAggregate(채점
  //    파이프라인)와 공유하는 deriveCodeFlags. 소거는 하지 않는다(역방향 미대응,
  //    원본 플래그는 항상 보존 — 기술 부채로 기록).
  const aiLevelByCode = new Map<ItemCode, Level>(details.map((d) => [d.item_code, d.level]));
  const overrideByCode = new Map<ItemCode, OverrideInput>(overrides.map((o) => [o.item_code, o]));
  const effectiveItems = ITEM_CODES.map((code) => {
    const level = overrideByCode.get(code)?.level_override ?? aiLevelByCode.get(code);
    if (level === undefined) {
      throw new Error(`평가 상세 누락: evaluation_id=${evaluationId}, item_code=${code}`);
    }
    return { 항목코드: code, 충족수준: level };
  });
  const baseFlags = flags.map((f) => ({ 규칙번호: f.rule_number }));
  const effectiveFlags = deriveCodeFlags(effectiveItems, baseFlags, matchingVerdict);
  const cut = await configRepo.getNumber('low_score_cut', DEFAULT_LOW_SCORE_CUT);
  const agg = computeAggregates(
    effectiveItems,
    effectiveFlags,
    cut,
  );

  // ④ 3-F 업서트 + 3-G 교체 — 한 트랜잭션
  await withTransaction(async (conn) => {
    const [res] = await conn.query<ResultSetHeader>(
      `INSERT INTO evaluation_reviews
         (evaluation_id, review_status, reviewer, review_comment,
          final_score_effective, status_label_effective, risk_flagged_effective)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         review_id = LAST_INSERT_ID(review_id),
         review_status = VALUES(review_status),
         reviewer = VALUES(reviewer),
         review_comment = VALUES(review_comment),
         final_score_effective = VALUES(final_score_effective),
         status_label_effective = VALUES(status_label_effective),
         risk_flagged_effective = VALUES(risk_flagged_effective)`,
      [
        evaluationId, input.review_status, input.reviewer, input.review_comment ?? null,
        agg.finalScore, agg.statusLabel, Number(agg.riskFlagged),
      ],
    );
    const reviewId = res.insertId;

    // 3-G 교체 — 요청 본문이 전체 상태 (전삭제 후 재삽입)
    await conn.query(`DELETE FROM evaluation_review_overrides WHERE review_id = ?`, [reviewId]);
    if (overrides.length > 0) {
      const values = overrides.map((ov) => [
        reviewId,
        ov.item_code,
        aiLevelByCode.get(ov.item_code), // 수정 시점의 AI 판정 스냅샷 (감사 추적)
        ov.level_override,
        ov.override_reason ?? null,
      ]);
      await conn.query(
        `INSERT INTO evaluation_review_overrides
           (review_id, item_code, level_original, level_override, override_reason)
         VALUES ?`,
        [values],
      );
    }
  });

  return getReview(evaluationId);
}

/**
 * 검수 조회 — 계약 §3.1 응답의 review 블록 형태로 반환.
 * 화면② GET 라우트가 review 블록(없으면 null)으로 그대로 사용 (계약 §3.3).
 */
export async function getReview(evaluationId: number): Promise<any | null> {
  const rows = await query<any>(
    `SELECT review_id, evaluation_id, review_status, reviewer, review_comment,
            final_score_effective, status_label_effective, risk_flagged_effective,
            reviewed_at
       FROM evaluation_reviews
      WHERE evaluation_id = ?`,
    [evaluationId],
  );
  const r = rows[0];
  if (!r) return null;

  const overrides = await query<any>(
    `SELECT item_code, level_original, level_override, override_reason
       FROM evaluation_review_overrides
      WHERE review_id = ?
      ORDER BY FIELD(item_code, ${ITEM_CODES.map(() => '?').join(',')})`,
    [r.review_id, ...ITEM_CODES],
  );

  // 병기 배열은 공용 헬퍼 단일 구현 (화면①② 규칙과 동일 — 계약 §3.1)
  const cut = await configRepo.getNumber('low_score_cut', DEFAULT_LOW_SCORE_CUT);

  return {
    review_id: r.review_id,
    evaluation_id: r.evaluation_id,
    review_status: r.review_status,
    reviewer: r.reviewer,
    review_comment: r.review_comment,
    overrides,
    effective: {
      final_score: r.final_score_effective,
      status_label: r.status_label_effective,
      risk_flagged: Boolean(r.risk_flagged_effective),
      status_labels: computeStatusLabels(
        r.status_label_effective, r.final_score_effective, cut,
      ),
    },
    reviewed_at: r.reviewed_at,
  };
}

/**
 * 검수 철회 (계약 §3.2 — DELETE). 3-E '검수폐기' 보존 → 3-F 삭제(3-G CASCADE)
 * — 한 트랜잭션. 화면 집계는 AI 원본으로 되돌아간다.
 * @returns 삭제 여부 (검수 없음 → false — 라우트 404)
 */
export async function deleteReview(evaluationId: number): Promise<boolean> {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT m.consultation_id
         FROM evaluation_reviews r
         JOIN ai_evaluation_master m ON m.evaluation_id = r.evaluation_id
        WHERE r.evaluation_id = ?
        FOR UPDATE`,
      [evaluationId],
    );
    if (rows.length === 0) return false;

    const preserved = await preserveReviewOnConn(
      conn, rows[0].consultation_id, evaluationId, '검수 철회(DELETE)로 폐기',
    );
    if (!preserved) return false; // FOR UPDATE 이후 소실 — 방어적 (정상 흐름에선 불가)

    await conn.query(`DELETE FROM evaluation_reviews WHERE evaluation_id = ?`, [evaluationId]);
    return true;
  });
}

/**
 * 3-E '검수폐기' 보존 헬퍼 — 3-F 행이 지워지기 직전, 같은 트랜잭션에서 호출.
 * 사용처: ① deleteReview(철회) ② evaluationRepo.saveFinalEvaluation의 재채점
 * 덮어쓰기 경로 (기존 정본 DELETE 직전 — force든 검수중 건이든 검수가 있으면 무조건).
 * candidate_json에 검수 전문(검수자·상태·override 목록·코멘트·유효 집계)을 보존한다.
 *
 * @returns 보존 여부 (해당 평가에 검수 없으면 false — 기록 없이 통과)
 */
export async function preserveReviewOnConn(
  conn: PoolConnection,
  consultationId: number,
  evaluationId: number,
  reason: string,
): Promise<boolean> {
  const [reviews] = await conn.query<RowDataPacket[]>(
    `SELECT review_id, evaluation_id, review_status, reviewer, review_comment,
            final_score_effective, status_label_effective, risk_flagged_effective,
            reviewed_at
       FROM evaluation_reviews
      WHERE evaluation_id = ?`,
    [evaluationId],
  );
  const review = reviews[0];
  if (!review) return false;

  const [overrides] = await conn.query<RowDataPacket[]>(
    `SELECT item_code, level_original, level_override, override_reason
       FROM evaluation_review_overrides
      WHERE review_id = ?`,
    [review.review_id],
  );

  // attempt_no는 상담 기준 이어 세기 (정본교체 보존과 동일 규약)
  const [seqRows] = await conn.query<RowDataPacket[]>(
    `SELECT COALESCE(MAX(attempt_no), 0) + 1 AS next_no
       FROM ai_evaluation_verify_log
      WHERE consultation_id = ?`,
    [consultationId],
  );

  await conn.query(
    `INSERT INTO ai_evaluation_verify_log
       (consultation_id, evaluation_id, attempt_no, stage, checker,
        checker_model, passed, issues, candidate_json)
     VALUES (?, NULL, ?, '검수폐기', '코드', NULL, 1, ?, ?)`,
    [
      consultationId,
      seqRows[0].next_no,
      `${reason} — review_id=${review.review_id}, evaluation_id=${review.evaluation_id}, ` +
        `status=${review.review_status}, reviewer=${review.reviewer}, ` +
        `overrides=${overrides.length}건, ` +
        `final_score_effective=${review.final_score_effective}, ` +
        `status_label_effective=${review.status_label_effective}`,
      JSON.stringify({ ...review, overrides }),
    ],
  );
  return true;
}

/**
 * 확정 검수 존재 여부 — 배치 재채점의 기본 스킵 판정 (계약 결정 3).
 * score-all 등 배치는 **채점 시작 전** 이 함수로 건너뛴다 (LLM 호출 낭비 방지).
 * saveFinalEvaluation의 저장 시점 skip은 최후 방어선으로 별도 유지.
 */
export async function hasConfirmedReview(
  consultationId: number,
  evaluator: 'AI_최종' | '사람_골든셋' = 'AI_최종',
): Promise<boolean> {
  const rows = await query(
    `SELECT 1
       FROM evaluation_reviews r
       JOIN ai_evaluation_master m ON m.evaluation_id = r.evaluation_id
      WHERE m.consultation_id = ? AND m.evaluator = ? AND r.review_status = '확정'
      LIMIT 1`,
    [consultationId, evaluator],
  );
  return rows.length > 0;
}

/**
 * 다음 검수 이력 버전 번호 — 해당 평가의 최대 version_no + 1 (이력 없으면 1).
 * verifyLogRepo.ts의 getNextAttemptNo()와 동일 패턴(1부터 재시작 금지, MAX+1 채번).
 */
export async function getNextVersionNo(evaluationId: number): Promise<number> {
  const rows = await query<{ next_no: number }>(
    `SELECT COALESCE(MAX(version_no), 0) + 1 AS next_no
       FROM evaluation_review_history
      WHERE evaluation_id = ?`,
    [evaluationId],
  );
  return rows[0].next_no;
}

/**
 * 검수 이력 스냅샷 1건 기록 — getNextVersionNo로 채번 후 INSERT.
 * snapshot은 호출부가 넘긴 값을 그대로 JSON.stringify해 저장한다(가공 없음).
 */
export async function insertReviewHistory(evaluationId: number, snapshot: unknown): Promise<void> {
  const versionNo = await getNextVersionNo(evaluationId);
  await query(
    `INSERT INTO evaluation_review_history (evaluation_id, version_no, snapshot) VALUES (?, ?, ?)`,
    [evaluationId, versionNo, JSON.stringify(snapshot)],
  );
}

/**
 * 검수 이력 전체 조회 — 최신 버전 먼저(version_no DESC).
 * snapshot 컬럼은 JSON.parse하지 않는다 — mysql2가 JSON 타입 컬럼을 이미 파싱된
 * 객체로 반환함을 실물 확인함(scripts/_tmp-check-json-behavior.ts, typeof === 'object').
 * 여기서 다시 JSON.parse하면 문자열이 아닌 값을 파싱하려다 런타임 에러가 난다.
 */
export async function getReviewHistory(evaluationId: number): Promise<ReviewHistoryEntry[]> {
  return query<ReviewHistoryEntry>(
    `SELECT history_id, version_no, snapshot, created_at
       FROM evaluation_review_history
      WHERE evaluation_id = ?
      ORDER BY version_no DESC`,
    [evaluationId],
  );
}
