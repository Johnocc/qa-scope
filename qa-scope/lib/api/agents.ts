import { fetchApi, ApiError } from './client';
import mockSummary from '../mocks/fixtures/agents-summary.json';
import mockReport from '../mocks/fixtures/agent-report.json';
import type { AgentsSummaryResponse, AgentReportResponse, Period } from '../types/agent';

/**
 * 화면③ 대시보드.
 *
 * `GET /api/agents/summary`는 아직 백엔드에 없다 (화면③ 계약 §6 남은 일 —
 * `lib/db/agentReportRepo.ts`의 집계 로직을 재사용해 만들 예정). 그래서
 * 지금은 항상 목업으로 그린다. 라우트가 생기면 아래 fetchApi 호출이
 * 자연히 성공해서 그대로 넘어간다 — 이 함수의 나머지 코드는 손댈 필요 없음.
 */
export async function getAgentsSummary(period: Period = '30d'): Promise<AgentsSummaryResponse> {
  try {
    return await fetchApi<AgentsSummaryResponse>(`/api/agents/summary?period=${period}`);
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 404)) {
      console.warn('[getAgentsSummary] 실 API 실패 → 목업 데이터 사용:', err);
    }
    return mockSummary as AgentsSummaryResponse;
  }
}

/**
 * 화면④ 개인 리포트. `GET /api/agents/{id}/report`는 이미 구현돼 있다.
 * 다만 v1.2(순위·팀 비교 제거) 반영 전이라 team_avg_score·rank·agent_count·
 * team_rate가 아직 같이 내려온다 — AgentReportResponse 타입에 그 필드가
 * 없으니 컴포넌트에서 실수로 참조할 일이 없다. 백엔드가 v1.2를 반영해도
 * 이 함수는 그대로 둬도 된다.
 */
export async function getAgentReport(
  agentId: string,
  period: Period = '30d',
): Promise<AgentReportResponse> {
  try {
    return await fetchApi<AgentReportResponse>(`/api/agents/${agentId}/report?period=${period}`);
  } catch (err) {
    console.warn('[getAgentReport] 실 API 실패 → 목업 데이터 사용:', err);
    return mockReport as AgentReportResponse;
  }
}
