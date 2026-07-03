/**
 * lib/db/evaluationRepo.ts — 테이블 3-A·3-B·3-C·3-D
 *
 * saveFinalEvaluation()이 이 어댑터의 심장:
 *   출력스키마 ver2(한글 키) JSON 1건을 받아
 *   ① 집계를 결정론적으로 재계산하고 (AI 산수 미신뢰)
 *   ② 3-A 헤더 + 3-B 18항목 + 3-D 근거 + 3-C 플래그를 한 트랜잭션으로 저장.
 *   근거의 dialogue_id는 저장 전에 파이프라인 ②(matchQuote)에서 확정돼
 *   evidenceDialogueIds 로 넘어온다고 가정 (미확정 시 NULL 저장).
 */
import { query, withTransaction } from './pool';
import type { ResultSetHeader } from 'mysql2/promise';
import { computeAggregates } from '../scoring/scoring';
import { MAX_SCORES, ITEM_CODES, expectedScore, type ItemCode } from '../scoring/constants';
import * as configRepo from './configRepo';

export interface SaveOptions {
  evaluator?: 'AI_최종' | '사람_골든셋';
  aiModel?: string | null;
  rubricVersion?: string;
  verifyAttempts?: number;
  /** "항목코드|근거인덱스" → 확정 dialogue_id */
  evidenceDialogueIds?: Map<string, number>;
}

export interface DashboardQuery {
  statusLabel?: string | null;
  limit?: number;
  offset?: number;
}

/**
 * 최종 평가 저장.
 * @param consultationId 내부 PK (상담코드 → PK 변환은 호출부/파이프라인 책임)
 * @param payload 출력스키마 ver2 JSON (형식검증 통과본)
 * @returns evaluationId
 */
export async function saveFinalEvaluation(
  consultationId: number,
  payload: any,
  options: SaveOptions = {},
): Promise<number> {
  const {
    evaluator = 'AI_최종',
    aiModel = null,
    rubricVersion = 'v1.5',
    verifyAttempts = 1,
    evidenceDialogueIds = new Map<string, number>(),
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

    return evaluationId;
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

/**
 * 목록 화면(화면①)용 조회.
 * 정렬 정책: 불완전판매 의심 우선 → 저점수 → 정상, 그 안에서 점수 낮은 순.
 */
export async function listForDashboard({
  statusLabel = null,
  limit = 50,
  offset = 0,
}: DashboardQuery = {}): Promise<any[]> {
  const where = statusLabel ? 'WHERE m.status_label = ?' : '';
  const params: any[] = statusLabel ? [statusLabel, limit, offset] : [limit, offset];
  return query(
    `SELECT m.evaluation_id, c.consultation_code, c.agent_id, c.consulted_at,
            m.consult_type_ai, m.recommend_type, m.final_score,
            m.risk_flagged, m.status_label, m.evaluated_at
       FROM ai_evaluation_master m
       JOIN consultation_master c ON c.consultation_id = m.consultation_id
       ${where}
      ORDER BY FIELD(m.status_label, '불완전판매 의심', '저점수', '정상'),
               m.final_score ASC
      LIMIT ? OFFSET ?`,
    params,
  );
}
