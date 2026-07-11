import { fetchApi } from './client';
import type { AgentsSummaryResponse, AgentReportResponse, Period } from '../types/agent';

/**
 * 화면③ 대시보드. GET /api/agents/summary — 실패를 여기서 삼키지 않는다: 그대로 던져서
 * 라우트 세그먼트의 error.tsx가 잡아 화면에 드러낸다 (조용한 목업 폴백 금지 — 실패는 티가 나야 한다).
 */
export async function getAgentsSummary(period: Period = '30d'): Promise<AgentsSummaryResponse> {
  return fetchApi<AgentsSummaryResponse>(`/api/agents/summary?period=${period}`);
}

/** 화면④ 개인 리포트. GET /api/agents/{id}/report. 실패 시 전파(위 주석 참조). */
export async function getAgentReport(
  agentId: string,
  period: Period = '30d',
): Promise<AgentReportResponse> {
  return fetchApi<AgentReportResponse>(`/api/agents/${agentId}/report?period=${period}`);
}
