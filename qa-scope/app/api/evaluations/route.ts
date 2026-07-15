/**
 * app/api/evaluations/route.ts — 채점 결과 목록 (GET /api/evaluations)
 *
 * 화면 ①(채점 결과 목록)용 — 정본 계약: docs/api/화면1_채점결과목록_API계약_v1.md
 * 응답 3블록: meta(필터 에코) / summary(전량·위험·표시 중 카운트) / items(표 본문).
 * status_labels 병기 배열은 조회 시점 low_score_cut으로 서버가 계산해 내려준다
 * (프론트 재계산 금지 — "계산은 코드가, 화면은 표시만").
 */
import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { computeStatusLabels, DEFAULT_LOW_SCORE_CUT } from '@/lib/db/statusLabels';
import { CONSULT_TYPES, STATUS_LABELS } from '@/lib/scoring/constants';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LIMIT = 200;

/** 파라미터 검증 (계약 §2·§4). 실패 시 에러 메시지 반환 */
function parseParams(searchParams: URLSearchParams):
  | { ok: true; q: Parameters<typeof db.evaluations.listForDashboard>[0] & object }
  | { ok: false; error: string } {
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');
  if ((dateFrom && !DATE_RE.test(dateFrom)) || (dateTo && !DATE_RE.test(dateTo))) {
    return { ok: false, error: 'invalid date format' };
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return { ok: false, error: 'invalid date range' };
  }

  const consultType = searchParams.get('consult_type');
  if (consultType && !(CONSULT_TYPES as readonly string[]).includes(consultType)) {
    return { ok: false, error: 'invalid consult_type' };
  }
  const status = searchParams.get('status');
  if (status && !(STATUS_LABELS as readonly string[]).includes(status)) {
    return { ok: false, error: 'invalid status' };
  }

  const reviewStatus = searchParams.get('review_status');
  const REVIEW_STATUSES = ['미검수', '검수중', '확정'] as const;
  if (reviewStatus && !(REVIEW_STATUSES as readonly string[]).includes(reviewStatus)) {
    return { ok: false, error: 'invalid review_status' };
  }

  const riskFlagged = searchParams.get('risk_flagged');
  if (riskFlagged && riskFlagged !== 'true' && riskFlagged !== 'false') {
    return { ok: false, error: 'invalid risk_flagged' };
  }

  const sort = searchParams.get('sort') ?? 'risk';
  if (sort !== 'risk' && sort !== 'date') {
    return { ok: false, error: 'invalid sort' };
  }

  const limit = Number(searchParams.get('limit') ?? 50);
  const offset = Number(searchParams.get('offset') ?? 0);
  if (!Number.isInteger(limit) || limit <= 0) return { ok: false, error: 'invalid limit' };
  if (limit > MAX_LIMIT) return { ok: false, error: 'limit too large' };
  if (!Number.isInteger(offset) || offset < 0) return { ok: false, error: 'invalid offset' };

  return {
    ok: true,
    q: {
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      agentId: searchParams.get('agent_id') || null,
      consultType: consultType || null,
      statusLabel: status || null,
      reviewStatus: (reviewStatus as '미검수' | '검수중' | '확정' | null) || null,
      riskFlagged: (riskFlagged as 'true' | 'false' | null) || null,
      sort,
      limit,
      offset,
    },
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = parseParams(searchParams);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const q = parsed.q;

    const [rows, counts, cut] = await Promise.all([
      db.evaluations.listForDashboard(q),
      db.evaluations.countForDashboard(q),
      db.config.getNumber('low_score_cut', DEFAULT_LOW_SCORE_CUT),
    ]);

    const items = rows.map((r: any) => ({
      evaluation_id: r.evaluation_id,
      consultation_code: r.consultation_code,
      agent_id: r.agent_id,
      agent_name: r.agent_id === 'unknown' ? '미배정' : r.agent_name,
      consulted_at: r.consulted_at,
      consult_type: r.consult_type_ai ?? null,
      final_score: Number(r.final_score),
      risk_flagged: Boolean(r.risk_flagged),
      status_label: r.status_label,
      status_labels: computeStatusLabels(r.status_label, Number(r.final_score), cut),
      review_status: r.review_status as '미검수' | '검수중' | '확정',
    }));

    return NextResponse.json({
      meta: {
        filters: {
          date_from: q.dateFrom,
          date_to: q.dateTo,
          agent_id: q.agentId,
          consult_type: q.consultType,
          status: q.statusLabel,
          review_status: q.reviewStatus,
          risk_flagged: q.riskFlagged,
        },
        sort: q.sort,
        limit: q.limit,
        offset: q.offset,
        generated_at: new Date().toISOString(),
      },
      summary: counts,
      items,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
