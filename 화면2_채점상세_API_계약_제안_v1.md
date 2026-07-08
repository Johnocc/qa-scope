# 화면② 채점 상세 — API 응답 계약 제안 v1

> ⚠️ **SUPERSEDED (2026-07-08)** — 우현님이 `화면2_채점상세_API계약_v1.md`로 확정했습니다.
> 이 문서는 제안 당시 초안으로 남겨두며(이력 보존), 실제 구현·목업은 확정본 기준입니다.
> 주요 변경점: **`evaluation` 블록은 영문 전환 없이 출력스키마 ver2 한글 키 그대로 유지**(이 문서에서 제안했던 영문 전환은 채택되지 않음),
> 대신 `header`(snake_case) 블록 신설. 점프 키는 문자열 대화ID가 아니라 숫자 `dialogue_id`.

> **작성:** 민재(프론트) — 우현님 확인·합의 요청
> **목적:** 화면④ `agent-report.v1`과 같은 방식의 계약 문서. 화면②는 지금까지 LLM 출력 그대로인
> 한글 키(출력스키마 ver2)를 프론트에 직접 썼는데, 1조 확정 피드백("API 키는 영문 snake_case로 통일,
> 화면②만 한글이라 이거 맞춰야 함")에 따라 이번에 영문으로 전환했습니다.
> **참고:** 필드명은 `lib/db/AXDB_v2.sql`의 `ai_evaluation_master`·`ai_evaluation_details`·
> `ai_evaluation_risk_flags`·`ai_evaluation_evidences`·`consultation_dialogues` 컬럼명과 그대로 맞춤.

---

## 1. 약속 제안 사항

| # | 제안 | 내용·이유 |
|---|---|---|
| 1 | **키 표기 = 영문 snake_case** | 화면①④와 동일 원칙. LLM 계약(출력스키마 ver2, 한글 키)과 앱 API(영문)는 역할 분리 — 이 API는 "앱 API" 쪽 |
| 2 | **항목평가는 항상 18개 고정** | `items` 배열에서 해당없음(N/A) 항목도 빼지 않는다. `level: "해당없음"`이면 `evidences: []` |
| 3 | **근거는 배열로** | `evidences[]` — 항목 1개에 근거가 여러 개 붙을 수 있음(`ai_evaluation_evidences` 1:N). 지금 예시는 항목당 1개뿐이지만 스키마는 항상 배열 |
| 4 | **집계는 서버 재계산값, LLM 원본 아님** | `aggregate.*`는 `ai_evaluation_details`에서 코드가 결정론적으로 재계산한 값(LLM 산수 미신뢰 원칙, CLAUDE.md §5.2·§10) |
| 5 | **원문(transcript)은 별도 배열로 동봉** | `consultation_dialogues`를 상담 1건 기준으로 순서대로 내려줌. `evidences[].dialogue_code`와 `transcript[].dialogue_code`가 같은 값이면 매칭 → "점수 클릭 → 원문 점프" 연결고리 |
| 6 | **소수 처리** | 점수류는 소수 1자리 반올림 |

---

## 2. 엔드포인트

```
GET /api/evaluations/{consultation_id}
```

- 성공: `200` + 아래 §3 형태 JSON
- 존재하지 않는 상담: `404` + `{ "error": "consultation not found" }`

---

## 3. 응답 구조

화면 요소와의 대응:

| 응답 블록 | 화면② 요소 |
|---|---|
| 최상위 필드 | 헤더(상담번호·상담사·유형·상태태그) |
| `items[]` | 우측 항목별 점수 리스트 |
| `items[].evidences[]` | "점수 클릭 → 원문 점프"의 연결고리 |
| `risk_flags[]` | 위험 태그 |
| `aggregate` | 총점 |
| `transcript[]` | 좌측 상담 원문 |

```json
{
  "consultation_id": "C-2026-018442",
  "agent_id": "AG-005",
  "agent_name": "이서연",
  "consultation_type": "해지·환급",
  "recommend_type": "유지·해지방어·승환",
  "sales_info": null,
  "items": [
    {
      "item_code": "B1",
      "level": "충족",
      "max_score": 8,
      "earned_score": 8,
      "comment": "환급금·원금 손실 사실을 정확히 안내.",
      "evidences": [
        { "dialogue_code": "C-2026-018442-010", "quote": "현재 해지환급금은 납입원금보다 약 80만 원 적은 320만 원으로 조회됩니다." }
      ]
    }
  ],
  "risk_flags": [],
  "aggregate": {
    "raw_score_sum": 72,
    "applied_max_sum": 75,
    "final_score": 96.0,
    "risk_flagged": false,
    "status_label": "정상"
  },
  "csat": { "grade": "만족", "score": null, "basis": "..." },
  "summary": "종신보험 해지·환급금 문의 건...",
  "overall_feedback": "해지환급금 등 전문용어를...",
  "transcript": [
    { "dialogue_code": "C-2026-018442-001", "turn_order": 1, "speaker": "고객", "spoken_at": "2026-06-20T10:00:00+09:00", "offset_sec": 0, "content": "여보세요." }
  ]
}
```

### 3.1 최상위 필드
| 필드 | 타입 | 설명 |
|---|---|---|
| `consultation_id` | string | 대외 표기 코드 |
| `agent_id` / `agent_name` | string / string\|null | 상담사. 이름은 마스터 테이블 전까지 `null` 가능 |
| `consultation_type` | string | 상담유형 |
| `recommend_type` | string | `없음`\|`신규판매`\|`유지·해지방어·승환` — D영역 N/A 트리거 |
| `sales_info` | object\|null | `recommend_type=신규판매`일 때만 채움(권유상품·매칭판정·확인절차). 그 외 `null` |

### 3.2 `items[]` (항상 18개, A1→E2 순)
| 필드 | 타입 | 설명 |
|---|---|---|
| `item_code` | string | `A1`~`E2` |
| `level` | string | `충족`\|`부분충족`\|`미충족`\|`해당없음` (`ai_evaluation_details.level`) |
| `max_score` | number | 배점(루브릭 v1.5 고정) |
| `earned_score` | number | 획득점수 |
| `comment` | string\|null | 판정 사유 |
| `evidences[]` | object[] | `{ dialogue_code, quote }`. `level=해당없음`이면 `[]` |

### 3.3 `risk_flags[]`
| 필드 | 타입 | 설명 |
|---|---|---|
| `rule_number` | number | 1~6 |
| `related_item_code` | string\|null | 관련 항목 |
| `basis` | string | 근거 |

### 3.4 `aggregate`
`raw_score_sum` / `applied_max_sum` / `final_score` / `risk_flagged` / `status_label` — 전부 `ai_evaluation_master` 컬럼명과 동일. 화면④·화면①과 같은 원칙(서버 계산, 프론트 재계산 금지).

### 3.5 `transcript[]`
| 필드 | 타입 | 설명 |
|---|---|---|
| `dialogue_code` | string | 대외 표기 코드 (`consultation_dialogues.dialogue_code`) |
| `turn_order` | number | 상담 내 순서 |
| `speaker` | string | `상담사`\|`고객` |
| `spoken_at` | string(date-time) | 발화 시각 |
| `offset_sec` | number\|null | 상담 시작 기준 상대 오프셋(초) — 화면에 `[00:38]`처럼 표시할 때 사용 |
| `content` | string | 발화 원문 |

---

## 4. 엣지 케이스

| 상황 | 응답 |
|---|---|
| `recommend_type=없음` (권유 자체가 없던 상담) | D1~D6 전부 `level: "해당없음"`, `evidences: []` |
| 근거 대화 특정 불가 | 그 근거 객체는 만들지 않거나 `dialogue_code: null` — 프론트는 `evidences`가 비어있으면 "근거 없음" 처리(현재 목업과 동일 로직) |
| 존재하지 않는 `consultation_id` | `404` |

---

*목업 참고: `mockups/화면2_채점상세_목업.html`이 이 계약을 그대로 반영해 만들어져 있습니다(EVALUATION 객체 구조 동일, 다만 `sales_info`·`csat`·`summary`·`overall_feedback`·`transcript[].turn_order`/`spoken_at`은 목업에서 화면에 직접 안 쓰여 생략됨 — 실 연동 시 채워서 내려주면 됨).*
