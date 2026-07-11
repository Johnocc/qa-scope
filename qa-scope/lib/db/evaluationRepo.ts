/**
 * lib/db/evaluationRepo.ts — 테이블 3-A·3-B·3-C·3-D
 *
 * saveFinalEvaluation()이 이 어댑터의 심장:
 *   출력스키마 ver2(한글 키) JSON 1건을 받아
 *   ① 집계를 결정론적으로 재계산하고 (AI 산수 미신뢰)
 *   ② 3-A 헤더 + 3-B 18항목 + 3-D 근거 + 3-C 플래그를 한 트랜잭션으로 저장.
 *   근거의 dialogue_id는 저장 전에 파이프라인 ②(matchQuote)에서 확정돼
 *   evidenceDialogueIds 로 넘어온다고 가정 (미확정 시 NULL 저장).
 *
 * 재채점 = 덮어쓰기 (팀 결정 2026-07-06):
 *   상담당 (consultation_id, evaluator) 정본은 1건. 기존 정본이 있으면
 *   원본 전문(ai_output_json)을 3-E에 stage='정본교체' 행으로 보존한 뒤
 *   DELETE(자식 3-B·3-C·3-D는 CASCADE) → 새로 INSERT. 전부 한 트랜잭션이라
 *   "이전은 지웠는데 새 저장 실패" 공백 상태는 생기지 않는다.
 *   ※ evaluation_id는 재채점마다 새로 발급됨 — 외부 참조 키로 쓰지 말 것.
 */
import { query, withTransaction } from './pool';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { computeAggregates } from '../scoring/scoring';
import { MAX_SCORES, ITEM_CODES, expectedScore, type ItemCode } from '../scoring/constants';
import * as configRepo from './configRepo';
import { preserveReviewOnConn } from './reviewRepo';

export interface SaveOptions {
  evaluator?: 'AI_최종' | '사람_골든셋';
  aiModel?: string | null;
  rubricVersion?: string;
  verifyAttempts?: number;
  /** "항목코드|근거인덱스" → 확정 dialogue_id */
  evidenceDialogueIds?: Map<string, number>;
  /**
   * 확정 검수 존재 건 재채점 처리 (계약 결정 3-A). 기본 'skip'.
   *  - 'skip'  = 확정 검수가 걸린 정본은 덮어쓰지 않고 그대로 둔다 (최후 방어선).
   *              배치는 hasConfirmedReview로 채점 시작 전 이미 거르지만, 배치 외
   *              진입 경로(단건 재채점 등)를 위한 이중 안전망.
   *  - 'force' = 검수 전문을 3-E '검수폐기'로 보존한 뒤 CASCADE 삭제하고 재채점.
   *              의도적 재채점만 명시적으로 force.
   */
  onConfirmedReview?: 'skip' | 'force';
}

/** saveFinalEvaluation 결과 — skipped=true면 확정 검수 보호로 저장을 건너뛰고 기존 정본 유지 */
export interface SaveResult {
  evaluationId: number;
  skipped: boolean;
}

export interface DashboardQuery {
  /** 상담일(consulted_at) 범위 — 'YYYY-MM-DD'. to는 그 날 하루를 포함(< to+1일) */
  dateFrom?: string | null;
  dateTo?: string | null;
  agentId?: string | null;
  consultType?: string | null;
  statusLabel?: string | null;
  /** 'risk' = 위험·저점 우선(계약 결정 4, 기본) / 'date' = 상담일 최신순 */
  sort?: 'risk' | 'date';
  limit?: number;
  offset?: number;
}

/**
 * 최종 평가 저장.
 * @param consultationId 내부 PK (상담코드 → PK 변환은 호출부/파이프라인 책임)
 * @param payload 출력스키마 ver2 JSON (형식검증 통과본)
 * @returns { evaluationId, skipped } — skipped=true면 확정 검수 보호로 저장을 건너뜀
 */
export async function saveFinalEvaluation(
  consultationId: number,
  payload: any,
  options: SaveOptions = {},
): Promise<SaveResult> {
  const {
    evaluator = 'AI_최종',
    aiModel = null,
    rubricVersion = 'v1.5',
    verifyAttempts = 1,
    evidenceDialogueIds = new Map<string, number>(),
    onConfirmedReview = 'skip',
  } = options;

  const items: any[] = payload['항목평가'];
  const flags: any[] = payload['위험플래그'] || [];
  const cls = payload['분류'];
  const sale = payload['판매정보'] || null;
  const csat = payload['고객만족'] || {};

  // ① 집계 재계산 (컷값은 app_config 정본 → 실패 시 env 폴백)
  const cut = await configRepo.getNumber('low_score_cut', Number(process.env.LOW_SCORE_CUT || 70));
  const agg = computeAggregates(items, flags, cut);

  return withTransaction(async (conn) => {
    // ⓪ 재채점 덮어쓰기 — 기존 정본이 있으면 3-E에 보존 후 삭제
    const [prevRows] = await conn.query<RowDataPacket[]>(
      `SELECT evaluation_id, final_score, status_label, evaluated_at,
              verify_attempts, ai_output_json
         FROM ai_evaluation_master
        WHERE consultation_id = ? AND evaluator = ?
        FOR UPDATE`,
      [consultationId, evaluator],
    );
    const prev = prevRows[0];
    if (prev) {
      // 재채점이 기존 정본을 덮어쓰기 전에, 이 평가에 걸린 검수(3-F)를 먼저 처리한다.
      // 3-F는 evaluation_id FK ON DELETE CASCADE라 아래 master DELETE 시 함께 지워지므로,
      // ① 확정 검수 스킵 판정과 ② 검수 전문 보존을 삭제 전에 수행한다 (계약 결정 3).
      const [revRows] = await conn.query<RowDataPacket[]>(
        `SELECT review_status FROM evaluation_reviews WHERE evaluation_id = ? FOR UPDATE`,
        [prev.evaluation_id],
      );
      const review = revRows[0];

      // 최후 방어선(계약 결정 3-A): 확정 검수 존재 + 기본(skip) → 덮어쓰지 않고 기존 정본 유지.
      // 배치(score-all)는 채점 시작 전 hasConfirmedReview로 이미 거르지만, 배치 외 진입 경로
      // (단건 재채점 API 등)를 위한 이중 안전망. 의도적 재채점만 onConfirmedReview='force'.
      if (review?.review_status === '확정' && onConfirmedReview === 'skip') {
        return { evaluationId: prev.evaluation_id, skipped: true };
      }

      // 검수가 있으면(확정+force 든 미확정 검수중이든) 삭제 직전 3-E '검수폐기'로 전문 보존.
      // 3-F 행이 지워지는 모든 경로에서 보존 — 보존 없는 검수 삭제 경로를 만들지 않는다
      // (계약 결정 3 부속·보존 규약 통일). preserveReviewOnConn은 검수 없으면 no-op.
      if (review) {
        const reason =
          review.review_status === '확정'
            ? '재채점 force로 확정 검수 폐기'
            : '재채점 덮어쓰기로 검수중 검수 폐기';
        await preserveReviewOnConn(conn, consultationId, prev.evaluation_id, reason);
      }

      // attempt_no는 상담 기준 이어 세기 — UNIQUE(consultation_id, attempt_no, stage) 충돌 방지
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
         VALUES (?, NULL, ?, '정본교체', '코드', NULL, 1, ?, ?)`,
        [
          consultationId,
          seqRows[0].next_no,
          `재채점 덮어쓰기로 폐기 — evaluation_id=${prev.evaluation_id}, ` +
            `final_score=${prev.final_score}, status_label=${prev.status_label}, ` +
            `evaluated_at=${prev.evaluated_at}, verify_attempts=${prev.verify_attempts}`,
          prev.ai_output_json == null
            ? null
            : typeof prev.ai_output_json === 'string'
              ? prev.ai_output_json
              : JSON.stringify(prev.ai_output_json),
        ],
      );
      await conn.query(
        `DELETE FROM ai_evaluation_master WHERE evaluation_id = ?`,
        [prev.evaluation_id],
      );
    }

    // ② 3-A 헤더
    const [res] = await conn.query<ResultSetHeader>(
      `INSERT INTO ai_evaluation_master (
         consultation_id, evaluator, ai_model, rubric_version, verify_attempts,
         consult_type_ai, consult_type_basis, recommend_type, recommend_basis,
         product_code, product_name, needs_scenario, matching_verdict,
         checked_purpose, checked_finance, checked_existing, verdict_basis,
         raw_score_sum, applied_max_sum, final_score, risk_flagged, status_label,
         csat_grade, csat_score, csat_basis,
         summary, overall_feedback, ai_output_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        consultationId, evaluator, aiModel, rubricVersion, verifyAttempts,
        cls['상담유형'], cls['유형근거'] ?? null, cls['권유유형'], cls['권유근거'] ?? null,
        sale ? sale['권유상품코드'] : null,
        sale ? (sale['권유상품명'] ?? null) : null,
        sale ? (sale['니즈시나리오코드'] ?? null) : null,
        sale ? sale['매칭판정'] : null,
        sale ? Number(Boolean(sale['확인절차']?.['가입목적'])) : null,
        sale ? Number(Boolean(sale['확인절차']?.['재정상황'])) : null,
        sale ? Number(Boolean(sale['확인절차']?.['기존계약'])) : null,
        sale ? (sale['판정근거'] ?? null) : null,
        agg.rawScoreSum, agg.appliedMaxSum, agg.finalScore,
        Number(agg.riskFlagged), agg.statusLabel,
        csat['등급'] ?? null, csat['점수'] ?? null, csat['근거'] ?? null,
        payload['요약'], payload['종합피드백'],
        JSON.stringify(payload), // 감사용 원본 전문
      ],
    );
    const evaluationId = res.insertId;

    // ③ 3-B 18항목 + 3-D 근거
    for (const it of items) {
      const code = it['항목코드'] as ItemCode;
      const [dres] = await conn.query<ResultSetHeader>(
        `INSERT INTO ai_evaluation_details
           (evaluation_id, item_code, level, max_score, earned_score, comment)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          evaluationId, code, it['충족수준'],
          MAX_SCORES[code],
          expectedScore(it['충족수준'], MAX_SCORES[code]), // AI 값이 아닌 규칙값 저장
          it['코멘트'] ?? null,
        ],
      );
      const detailId = dres.insertId;

      const evidences: any[] = Array.isArray(it['근거']) ? it['근거'] : [];
      if (evidences.length > 0) {
        const values = evidences.map((ev, idx) => [
          detailId,
          evidenceDialogueIds.get(`${code}|${idx}`) ?? null,
          ev['인용문'],
        ]);
        await conn.query(
          `INSERT INTO ai_evaluation_evidences (detail_id, dialogue_id, quote) VALUES ?`,
          [values],
        );
      }
    }

    // ④ 3-C 위험플래그
    if (flags.length > 0) {
      const values = flags.map((f) => [
        evaluationId, Number(f['규칙번호']), f['관련항목코드'] ?? null, f['근거'],
      ]);
      await conn.query(
        `INSERT INTO ai_evaluation_risk_flags
           (evaluation_id, rule_number, related_item_code, basis) VALUES ?`,
        [values],
      );
    }

    return { evaluationId, skipped: false };
  });
}

/** 평가 1건을 출력스키마 형태에 가깝게 재조립 (상세 화면용) */
export async function getFullEvaluation(evaluationId: number): Promise<any | null> {
  const masters = await query(
    `SELECT m.*, c.consultation_code
       FROM ai_evaluation_master m
       JOIN consultation_master c ON c.consultation_id = m.consultation_id
      WHERE m.evaluation_id = ?`,
    [evaluationId],
  );
  const master: any = masters[0];
  if (!master) return null;

  const details = await query<any>(
    `SELECT d.detail_id, d.item_code, d.level, d.max_score, d.earned_score, d.comment
       FROM ai_evaluation_details d
      WHERE d.evaluation_id = ?
      ORDER BY FIELD(d.item_code, ${ITEM_CODES.map(() => '?').join(',')})`,
    [evaluationId, ...ITEM_CODES],
  );
  const evidences = await query<any>(
    `SELECT e.detail_id, e.dialogue_id, dl.dialogue_code, e.quote
       FROM ai_evaluation_evidences e
       LEFT JOIN consultation_dialogues dl ON dl.dialogue_id = e.dialogue_id
      WHERE e.detail_id IN (SELECT detail_id FROM ai_evaluation_details WHERE evaluation_id = ?)`,
    [evaluationId],
  );
  const flags = await query<any>(
    `SELECT rule_number, related_item_code, basis
       FROM ai_evaluation_risk_flags WHERE evaluation_id = ? ORDER BY rule_number`,
    [evaluationId],
  );

  const evidenceByDetail = new Map<number, any[]>();
  for (const ev of evidences) {
    if (!evidenceByDetail.has(ev.detail_id)) evidenceByDetail.set(ev.detail_id, []);
    evidenceByDetail.get(ev.detail_id)!.push({
      대화ID: ev.dialogue_code ?? null,
      dialogue_id: ev.dialogue_id, // "점수 클릭→텍스트 점프"용 내부 키
      인용문: ev.quote,
    });
  }

  return {
    상담ID: master.consultation_code,
    evaluation_id: master.evaluation_id,
    평가메타: {
      평가주체: master.evaluator,
      AI모델: master.ai_model,
      루브릭버전: master.rubric_version,
      평가일시: master.evaluated_at,
      검증통과회차: master.verify_attempts,
    },
    분류: {
      상담유형: master.consult_type_ai,
      유형근거: master.consult_type_basis,
      권유유형: master.recommend_type,
      권유근거: master.recommend_basis,
    },
    판매정보: master.product_code == null ? null : {
      권유상품코드: master.product_code,
      권유상품명: master.product_name,
      니즈시나리오코드: master.needs_scenario,
      매칭판정: master.matching_verdict,
      확인절차: {
        가입목적: Boolean(master.checked_purpose),
        재정상황: Boolean(master.checked_finance),
        기존계약: Boolean(master.checked_existing),
      },
      판정근거: master.verdict_basis,
    },
    항목평가: details.map((d: any) => ({
      항목코드: d.item_code,
      충족수준: d.level,
      배점: d.max_score,
      획득점수: d.earned_score,
      근거: evidenceByDetail.get(d.detail_id) ?? [],
      코멘트: d.comment,
    })),
    위험플래그: flags.map((f: any) => ({
      규칙번호: f.rule_number, 관련항목코드: f.related_item_code, 근거: f.basis,
    })),
    집계: {
      원점수합: master.raw_score_sum,
      적용배점합: master.applied_max_sum,
      환산총점: master.final_score,
      위험표시여부: Boolean(master.risk_flagged),
      상태라벨: master.status_label,
    },
    고객만족: { 등급: master.csat_grade, 점수: master.csat_score, 근거: master.csat_basis },
    요약: master.summary,
    종합피드백: master.overall_feedback,
  };
}

/** 화면① 필터 → WHERE 절 조각 + 파라미터 (list·filtered_count가 동일 조각 공유 — 수치 불일치 방지) */
function dashboardWhere({
  dateFrom = null,
  dateTo = null,
  agentId = null,
  consultType = null,
  statusLabel = null,
}: DashboardQuery): { sql: string; params: any[] } {
  const conds: string[] = [`m.evaluator = 'AI_최종'`];
  const params: any[] = [];
  if (dateFrom) {
    conds.push('c.consulted_at >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    // 상담일 기준 to 포함 (consulted_at은 DATETIME이므로 다음날 0시 미만)
    conds.push('c.consulted_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(dateTo);
  }
  if (agentId) {
    conds.push('c.agent_id = ?');
    params.push(agentId);
  }
  if (consultType) {
    conds.push('m.consult_type_ai = ?');
    params.push(consultType);
  }
  if (statusLabel) {
    conds.push('m.status_label = ?');
    params.push(statusLabel);
  }
  return { sql: `WHERE ${conds.join(' AND ')}`, params };
}

/**
 * 목록 화면(화면①)용 조회 — 정본 계약: docs/api/화면1_채점결과목록_API계약_v1.md
 * 기본 정렬(sort=risk, 계약 결정 4): risk_flagged DESC → 상태라벨 순위
 * (불완전판매 의심 → 저점수 → 정상) → final_score ASC. sort=date는 상담일 최신순.
 * agents JOIN으로 agent_name 제공 (unknown 행은 명부에 '미배정'으로 시드됨).
 */
export async function listForDashboard(q: DashboardQuery = {}): Promise<any[]> {
  const { sort = 'risk', limit = 50, offset = 0 } = q;
  const where = dashboardWhere(q);
  const orderBy =
    sort === 'date'
      ? 'c.consulted_at DESC, m.evaluation_id DESC'
      : `m.risk_flagged DESC,
         FIELD(m.status_label, '불완전판매 의심', '저점수', '정상'),
         m.final_score ASC`;
  return query(
    `SELECT m.evaluation_id, c.consultation_code, c.agent_id,
            COALESCE(a.agent_name, c.agent_id) AS agent_name,
            c.consulted_at, m.consult_type_ai, m.recommend_type, m.final_score,
            m.risk_flagged, m.status_label, m.evaluated_at
       FROM ai_evaluation_master m
       JOIN consultation_master c ON c.consultation_id = m.consultation_id
       LEFT JOIN agents a ON a.agent_id = c.agent_id
       ${where.sql}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`,
    [...where.params, limit, offset],
  );
}

/**
 * 화면① summary 블록용 카운트 (계약 §3.2).
 *  - total_count·risk_count: 필터 무관 전체 (evaluator='AI_최종')
 *  - filtered_count: 필터 적용 후 총 건수 (limit/offset 무관 — 페이지 계산용)
 */
export async function countForDashboard(q: DashboardQuery = {}): Promise<{
  total_count: number;
  risk_count: number;
  filtered_count: number;
}> {
  const where = dashboardWhere(q);
  const [totals, filtered] = await Promise.all([
    query<{ total_count: number; risk_count: number }>(
      `SELECT COUNT(*) AS total_count, COALESCE(SUM(m.risk_flagged), 0) AS risk_count
         FROM ai_evaluation_master m
        WHERE m.evaluator = 'AI_최종'`,
    ),
    query<{ filtered_count: number }>(
      `SELECT COUNT(*) AS filtered_count
         FROM ai_evaluation_master m
         JOIN consultation_master c ON c.consultation_id = m.consultation_id
        ${where.sql}`,
      where.params,
    ),
  ]);
  return {
    total_count: Number(totals[0].total_count),
    risk_count: Number(totals[0].risk_count),
    filtered_count: Number(filtered[0].filtered_count),
  };
}
