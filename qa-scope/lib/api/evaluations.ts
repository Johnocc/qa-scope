import { fetchApi } from './client';
import type {
  EvaluationsListResponse,
  EvaluationsQueryParams,
  EvaluationDetailResponse,
  Review,
  ReviewStatus,
} from '../types/evaluation';
import type { OverrideInput } from '../db/reviewRepo';

/**
 * 화면① 목록. 실 API가 계약대로 {meta,summary,items}를 반환 — 쿼리 그대로 전달.
 * 실패를 여기서 삼키지 않는다: 그대로 던져서 라우트 세그먼트의 error.tsx가 잡아 화면에 드러낸다
 * (조용한 목업 폴백 금지 — 실패는 티가 나야 한다).
 */
export async function getEvaluations(
  params: EvaluationsQueryParams = {},
): Promise<EvaluationsListResponse> {
  const qs = new URLSearchParams();
  if (params.date_from) qs.set('date_from', params.date_from);
  if (params.date_to) qs.set('date_to', params.date_to);
  if (params.agent_id) qs.set('agent_id', params.agent_id);
  if (params.consult_type) qs.set('consult_type', params.consult_type);
  if (params.status) qs.set('status', params.status);
  if (params.review_status) qs.set('review_status', params.review_status);
  if (params.risk_flagged) qs.set('risk_flagged', params.risk_flagged);
  qs.set('sort', params.sort ?? 'risk');
  qs.set('limit', String(params.limit ?? 50));
  qs.set('offset', String(params.offset ?? 0));

  return fetchApi<EvaluationsListResponse>(`/api/evaluations?${qs}`);
}

/** 화면② 상세. 실 API가 {header, evaluation, dialogues, review}를 그대로 반환. 실패 시 전파(위 주석 참조). */
export async function getEvaluationDetail(
  evaluationId: number,
): Promise<EvaluationDetailResponse> {
  return fetchApi<EvaluationDetailResponse>(`/api/evaluations/${evaluationId}`);
}

/**
 * 검수 저장(업서트) — 클라이언트 컴포넌트 전용(브라우저에서 상대경로 fetch).
 * overrides = 항목별 충족수준 수정(ver2 검수). 점수는 서버 재계산.
 */
export async function putReview(
  evaluationId: number,
  body: {
    review_status: ReviewStatus;
    reviewer: string;
    review_comment: string | null;
    overrides?: OverrideInput[];
  },
): Promise<Review> {
  const res = await fetch(`/api/evaluations/${evaluationId}/review`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `검수 저장 실패 (${res.status})`);
  return data.review as Review;
}

/** 검수 철회 — DELETE, 화면 집계를 AI 원본으로 되돌림 */
export async function deleteReview(evaluationId: number): Promise<void> {
  const res = await fetch(`/api/evaluations/${evaluationId}/review`, { method: 'DELETE' });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `검수 철회 실패 (${res.status})`);
}
