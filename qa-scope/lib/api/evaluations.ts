import { fetchApi } from './client';
import mockList from '../mocks/fixtures/evaluations-list.json';
import mockDetail from '../mocks/fixtures/evaluation-detail.json';
import type {
  EvaluationsListResponse,
  EvaluationsQueryParams,
  EvaluationDetailResponse,
  Review,
  ReviewStatus,
} from '../types/evaluation';

/** 화면① 목록. 실 API가 계약대로 {meta,summary,items}를 반환 — 쿼리 그대로 전달 */
export async function getEvaluations(
  params: EvaluationsQueryParams = {},
): Promise<EvaluationsListResponse> {
  const qs = new URLSearchParams();
  if (params.date_from) qs.set('date_from', params.date_from);
  if (params.date_to) qs.set('date_to', params.date_to);
  if (params.agent_id) qs.set('agent_id', params.agent_id);
  if (params.consult_type) qs.set('consult_type', params.consult_type);
  if (params.status) qs.set('status', params.status);
  qs.set('sort', params.sort ?? 'risk');
  qs.set('limit', String(params.limit ?? 50));
  qs.set('offset', String(params.offset ?? 0));

  try {
    return await fetchApi<EvaluationsListResponse>(`/api/evaluations?${qs}`);
  } catch (err) {
    console.warn('[getEvaluations] 실 API 실패 → 목업 데이터 사용:', err);
    return mockList as EvaluationsListResponse;
  }
}

/** 화면② 상세. 실 API가 {header, evaluation, dialogues, review}를 그대로 반환 */
export async function getEvaluationDetail(
  evaluationId: number,
): Promise<EvaluationDetailResponse> {
  try {
    return await fetchApi<EvaluationDetailResponse>(`/api/evaluations/${evaluationId}`);
  } catch (err) {
    console.warn('[getEvaluationDetail] 실 API 실패 → 목업 데이터 사용:', err);
    return mockDetail as EvaluationDetailResponse;
  }
}

/**
 * 검수 저장(업서트) — 클라이언트 컴포넌트 전용(브라우저에서 상대경로 fetch).
 * v0 범위: review_status(검수중/확정) + reviewer + review_comment만.
 * overrides(항목별 점수수정)는 연기 v1 범위라 UI 미제공 — 계약 §1 결정 1 단계개방.
 */
export async function putReview(
  evaluationId: number,
  body: { review_status: ReviewStatus; reviewer: string; review_comment: string | null },
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
