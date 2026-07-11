/**
 * 화면①·② 타입 — 계약 정본:
 *   docs/api/화면1_채점결과목록_API계약_v1.md
 *   docs/api/화면2_채점상세_API계약_v1.md
 *
 * `evaluation` 블록만 출력스키마 ver2 한글 키를 그대로 쓴다 (계약 결정 1 —
 * LLM 출력 계약과 앱 API 계약을 분리하기 위한 의도적 예외). 나머지는 전부
 * snake_case.
 */

export type SatisfactionLevel = '충족' | '부분충족' | '미충족' | '해당없음';

// ---------------------------------------------------------------------
// 화면① 채점 결과 목록
// ---------------------------------------------------------------------

export interface EvaluationListItem {
  evaluation_id: number;
  consultation_code: string;
  agent_id: string;
  agent_name: string;
  consulted_at: string;
  consult_type: string | null;
  final_score: number;
  risk_flagged: boolean;
  status_label: string;
  status_labels: string[];
}

export interface EvaluationsListResponse {
  meta: {
    filters: {
      date_from: string | null;
      date_to: string | null;
      agent_id: string | null;
      consult_type: string | null;
      status: string | null;
    };
    sort: 'risk' | 'date';
    limit: number;
    offset: number;
    generated_at: string;
  };
  summary: {
    total_count: number;
    risk_count: number;
    filtered_count: number;
  };
  items: EvaluationListItem[];
}

export interface EvaluationsQueryParams {
  date_from?: string;
  date_to?: string;
  agent_id?: string;
  consult_type?: string;
  status?: string;
  sort?: 'risk' | 'date';
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------
// 화면② 채점 상세
// ---------------------------------------------------------------------

export interface EvaluationEvidence {
  대화ID: string | null;
  /** "항목 클릭 → 원문 점프"용 내부 키. 인용 대조 실패(환각 의심) 건은 null */
  dialogue_id: number | null;
  인용문: string;
}

export interface EvaluationItemScore {
  항목코드: string;
  충족수준: SatisfactionLevel;
  배점: number;
  획득점수: number;
  근거: EvaluationEvidence[];
  코멘트: string | null;
}

export interface EvaluationRiskFlag {
  규칙번호: number;
  관련항목코드: string | null;
  근거: string;
}

export interface SaleInfo {
  권유상품코드: string;
  권유상품명: string | null;
  니즈시나리오코드: string | null;
  매칭판정: '적합' | '부적합' | '명백한 오류';
  확인절차: { 가입목적: boolean; 재정상황: boolean; 기존계약: boolean };
  판정근거: string | null;
}

/** 출력스키마 ver2 재조립본 — 한글 키 그대로 (계약 결정 1) */
export interface EvaluationV2 {
  상담ID: string;
  evaluation_id: number;
  평가메타: {
    평가주체: string;
    AI모델: string | null;
    루브릭버전: string;
    평가일시: string;
    검증통과회차: number;
  };
  분류: {
    상담유형: string;
    유형근거: string | null;
    권유유형: string;
    권유근거: string | null;
  };
  판매정보: SaleInfo | null;
  항목평가: EvaluationItemScore[];
  위험플래그: EvaluationRiskFlag[];
  집계: {
    원점수합: number;
    적용배점합: number;
    환산총점: number;
    위험표시여부: boolean;
    상태라벨: string;
  };
  고객만족: { 등급: string | null; 점수: number | null; 근거: string | null };
  요약: string;
  종합피드백: string;
}

export interface DialogueTurn {
  dialogue_id: number;
  dialogue_code: string | null;
  turn_order: number;
  speaker: '상담사' | '고객';
  spoken_at: string;
  offset_sec: number | null;
  content: string;
}

export interface EvaluationDetailHeader {
  consultation_code: string;
  agent_id: string;
  agent_name: string;
  consulted_at: string;
  consult_type: string | null;
  risk_flagged: boolean;
  status_labels: string[];
}

// ---------------------------------------------------------------------
// 검수(리뷰) — 검수_쓰기_API계약_v1.md §3.1 / 화면② 계약 v1.1 §3.4
// ---------------------------------------------------------------------

export type ReviewStatus = '검수중' | '확정';

export interface ReviewOverride {
  item_code: string;
  level_original: SatisfactionLevel;
  level_override: SatisfactionLevel;
  override_reason: string | null;
}

export interface Review {
  review_id: number;
  evaluation_id: number;
  review_status: ReviewStatus;
  reviewer: string;
  review_comment: string | null;
  overrides: ReviewOverride[];
  /** 검수 반영 유효값 — 화면 표시는 COALESCE(effective, AI 원본) (계약 §4) */
  effective: {
    final_score: number;
    status_label: string;
    risk_flagged: boolean;
    status_labels: string[];
  };
  reviewed_at: string;
}

export interface EvaluationDetailResponse {
  header: EvaluationDetailHeader;
  evaluation: EvaluationV2;
  dialogues: DialogueTurn[];
  /** 검수 없으면 null */
  review: Review | null;
}
