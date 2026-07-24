/**
 * 화면③·④ 타입 — 계약 정본:
 *   docs/api/화면3_상담사대시보드_API계약_v1.md (v1.1)
 *   docs/api/화면4_상담사리포트_API계약_v1.md (v1.3)
 *
 * v1.2에서 순위·팀 비교 필드(team_avg_score·rank·agent_count·team_rate)가
 * 제거됐다 (코칭 도구 철학 — 인사고과 아님). 이 타입은 그 최신 계약 기준이라
 * 저 필드는 없다. 실제 API가 과도기적으로 그 필드를 더 내려주더라도(백엔드
 * 미반영 상태) 여기서 타입에 없으니 프론트는 그냥 참조하지 않는다.
 *
 * v1.4(2026-07-24)에서 domain_rates[].team_rate만 재도입 — 스파이더 차트에
 * "본인 vs 팀" 오버레이(점선)를 그리기 위함. team_avg_score·rank·agent_count는
 * 여전히 미도입(순위 줄세우기 배제 원칙 유지).
 */

export type DomainCode = 'A' | 'B' | 'C' | 'D' | 'E';
export type ItemStatus = '양호' | '보통' | '개선 필요' | '해당없음';
export type Period = '30d' | '90d' | 'all';

export interface WeakDomain {
  domain_code: DomainCode;
  domain_name: string;
  label: string;
}

// ---------------------------------------------------------------------
// 화면③ 상담사별 대시보드
// ---------------------------------------------------------------------

export interface AgentSummaryRow {
  agent_id: string;
  agent_name: string;
  evaluation_count: number;
  avg_score: number | null;
  risk_count: number;
  weak_domain: WeakDomain | null;
}

export interface AgentsSummaryResponse {
  meta: {
    period: Period;
    period_from: string | null;
    period_to: string | null;
    generated_at: string;
    rubric_version: string;
  };
  summary: {
    avg_score: number | null;
    evaluation_count: number;
    risk_count: number;
    agent_count: number;
  };
  agents: AgentSummaryRow[];
}

// ---------------------------------------------------------------------
// 화면④ 상담사 개인 평가 리포트
// ---------------------------------------------------------------------

export interface DomainRate {
  domain_code: DomainCode;
  domain_name: string;
  rate: number | null;
  /** 팀(본인·미배정 제외) 영역 획득률(%). v1.4 재도입 — 스파이더 팀 평균 오버레이용. 적용 0건이면 null */
  team_rate: number | null;
  applied_count: number;
}

export interface AgentReportItem {
  item_code: string;
  item_name: string;
  domain_code: DomainCode;
  max_score: number;
  applied_count: number;
  na_count: number;
  avg_earned: number | null;
  rate: number | null;
  status: ItemStatus;
}

export interface ImprovementItem {
  item_code: string;
  item_name: string;
  domain_code: DomainCode;
  rate: number;
  tip: string | null;
}

export interface AgentReportResponse {
  meta: {
    agent_id: string;
    agent_name: string;
    period: Period;
    period_from: string | null;
    period_to: string;
    generated_at: string;
    rubric_version: string;
    thresholds: { item_rate_warn: number; item_rate_ok: number };
  };
  summary: {
    evaluation_count: number;
    total_evaluation_count: number;
    avg_score: number | null;
    risk_count: number;
    total_risk_count: number;
    weak_domain: WeakDomain | null;
  };
  domain_rates: DomainRate[];
  items: AgentReportItem[];
  improvement_items: ImprovementItem[];
  /** rate < item_rate_warn 전체 항목 수(5개 초과분 존재 여부 판단용). improvement_items는 여전히 최대 5개 */
  improvement_items_total_count: number;
}
