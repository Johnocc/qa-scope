// 채점 시스템 공유 타입 — 스키마 ver2 기준

export type ItemCode =
  | 'A1' | 'A2' | 'A3'
  | 'B1' | 'B2' | 'B3' | 'B4'
  | 'C1' | 'C2' | 'C3'
  | 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6'
  | 'E1' | 'E2'

export type SatisfactionLevel = '충족' | '부분충족' | '미충족' | '해당없음'

export type EvidenceRef = {
  대화ID: string | number
  인용문: string
}

export type ItemEval = {
  항목코드: ItemCode
  충족수준: SatisfactionLevel
  배점: number
  획득점수: number
  근거: EvidenceRef[]
  코멘트?: string
}

export type RiskFlag = {
  규칙번호: 1 | 2 | 3 | 4 | 5 | 6
  관련항목코드?: ItemCode
  근거: string
}

export type SaleInfo = {
  권유상품코드: 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7'
  권유상품명?: string
  니즈시나리오코드: 'N1' | 'N2' | 'N3' | 'N4' | 'N5' | 'N6' | 'N7' | 'N8' | null
  매칭판정: '적합' | '부적합' | '명백한 오류'
  확인절차: { 가입목적: boolean; 재정상황: boolean; 기존계약: boolean }
  판정근거?: string
} | null

export type EvalOutput = {
  상담ID: string | number
  평가메타?: {
    평가주체?: 'AI_1차' | '모니터링_AI' | '사람_골든셋'
    AI모델?: string
    루브릭버전?: string
    평가일시?: string
  }
  분류: {
    상담유형: '신규·보장' | '계약변경' | '해지·환급' | '보험금청구' | '단순문의'
    유형근거?: string
    권유유형: '없음' | '신규판매' | '유지·해지방어·승환'
    권유근거?: string
  }
  판매정보: SaleInfo
  항목평가: ItemEval[]
  위험플래그: RiskFlag[]
  집계: {
    원점수합: number
    적용배점합: number
    환산총점: number
    위험표시여부: boolean
    상태라벨: '정상' | '불완전판매 의심' | '저점수'
  }
  고객만족?: {
    등급?: '매우 불만족' | '불만족' | '보통' | '만족' | '매우 만족' | null
    점수?: number | null
    근거?: string
  }
  요약: string
  종합피드백: string
}

export type Utterance = {
  utteranceId: string
  화자: '상담사' | '고객'
  타임스탬프: number
  대화내용: string
}
