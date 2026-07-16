# 화면④ 상담사 개인 평가 리포트 — API 응답 계약 v1

> **목적:** 프론트엔드(화면④ 목업 → Next.js 이식)와 백엔드(DB·집계 쿼리)가
> 서로 기다리지 않고 병렬로 작업하기 위한 **데이터 약속 문서**다.
> 프론트는 이 문서(+ 예시 JSON)만 보고 화면을 만들고,
> 백엔드는 이 문서대로 API를 구현한다. 형태가 같으면 붙였을 때 충돌이 없다.
>
> **예시 응답(목업 수치 그대로):** `schemas/agent-report.v1.example.json`
> — 프론트 개발 중 이 파일을 가짜 응답(stub)으로 그대로 사용 가능.

---

## 0. 쉬운 설명 (개발 배경을 모르는 팀원용)

- 화면④는 "상담사 한 명"의 성적표다. 그런데 DB에는 **상담 1건 단위**의
  채점 결과만 저장돼 있다. 그래서 서버가 그 상담사의 채점 결과 여러 건을
  **합산·평균 내서(=집계)** 화면이 바로 그릴 수 있는 형태로 내려줘야 한다.
- 이 문서는 그 "내려주는 데이터의 생김새"를 미리 못 박은 것이다.
  화면에 보이는 요소(상단 카드, 스파이더 차트, 개선 필요 항목,
  18개 항목 표)와 응답 블록이 **1:1로 대응**하도록 설계했다.
- 점수 계산·상태 판정("양호/보통/개선 필요")·약점 영역 선정은 **전부 서버가
  계산해서 내려준다.** 프론트는 받은 값을 그리기만 한다.
  (이 프로젝트의 원칙 "계산은 코드가, 화면은 표시만" — CLAUDE.md §7)
- 이 리포트는 **인사고과(순위 줄세우기)가 아니라 코칭(약점 진단)을 위한
  도구**다 (팀 결정 2026-07-08). 그래서 v1.2에서 팀 내 순위·팀 비교 수치를
  걷어내고, 본인 점수·약점·개선 항목 중심으로 재구성했다 — 화면③도 같은 철학.

---

## 1. 확정 결정 사항

| # | 결정 | 내용 · 이유 |
|---|---|---|
| 1 | **키 표기 = 영문 snake_case** | 기존 앱 API(`/api/evaluations`)와 통일. 한글 키는 LLM 출력 계약(출력스키마 ver2) 전용으로 유지 → "LLM 계약=한글 / 앱 API=영문"으로 역할 분리 |
| 2 | **N/A 항목도 빼지 않고 전달** | `items`는 **항상 18개 고정**. 적용 건수가 0인 항목은 `status: "해당없음"` + 수치 필드 `null` (팀 결정 2026-07-05) |
| 3 | **기간 필터 기준 = 상담일(`consulted_at`)** | "최근 30일"은 상담이 이뤄진 날짜 기준 (평가 실행일 아님) |
| 4 | **임계값은 서버가 내려줌** | 60%·80% 컷을 프론트에 하드코딩하지 않는다. `meta.thresholds`로 전달 (원본: `app_config`) — "70점 컷 하드코딩 금지"와 같은 원칙 |
| 5 | **상태·약점·개선목록은 서버 계산** | `items[].status`, `summary.weak_domain`, `improvement_items`를 프론트가 재계산하지 않는다 (화면③과 화면④가 어긋나는 것 방지) |
| 6 | **소수 처리** | 비율·평균은 소수 1자리 반올림한 JSON number (예: `81.3`) |
| 7 | **순위·팀 비교 제거 (v1.2)** | 화면③·④는 인사고과가 아니라 **코칭 도구** — 순위 줄세우기가 아니라 약점 진단 중심 (팀 결정 2026-07-08). `summary.rank`·`summary.agent_count`·`summary.team_avg_score`·`domain_rates[].team_rate`(팀 평균 점선) 제거. **스파이더 차트는 본인 값만** 그린다 |
| 8 | **전체 대비 표기는 응답 유지·화면 보류 (v1.2)** | 상단 요약의 "전체 N건 중 M건" 표기(표본 표기)는 현재 데이터 규모에서 무의미해 화면에서 제외. 다만 `total_evaluation_count`·`total_risk_count` **응답 필드는 유지** — 재도입 여부 미정이라 데이터가 쌓이면 화면만 복원하면 됨 (서버 무수정) |

---

## 2. 엔드포인트

```
GET /api/agents/{agent_id}/report?period=30d
```

| 파라미터 | 위치 | 값 | 기본값 | 설명 |
|---|---|---|---|---|
| `agent_id` | path | 문자열 (예: `AG-003`) | 필수 | 상담사 ID |
| `period` | query | `30d` \| `90d` \| `all` | `30d` | 조회 기간 (목업의 "최근 30일/90일/전체 기간" 셀렉트와 대응) |

- 성공: `200` + 아래 §3 형태의 JSON
- 존재하지 않는 상담사: `404` + `{ "error": "agent not found" }`
- 서버 오류: `500` + `{ "error": "<메시지>" }`

---

## 3. 응답 구조 (블록 4개 + 메타)

화면 요소와의 대응:

| 응답 블록 | 화면④ 요소 |
|---|---|
| `meta` | 헤더(상담사명·기간)·임계값 |
| `summary` | 상단 통계 카드 3개(건수·평균·위험) + 약점 배지 |
| `domain_rates` | 스파이더 차트 (5영역, **본인만** — v1.2) |
| `items` | 항목별 상세 표 (18개) |
| `improvement_items` | 개선 필요 항목 박스 |

### 3.1 `meta`

| 필드 | 타입 | 설명 |
|---|---|---|
| `agent_id` | string | 상담사 ID |
| `agent_name` | string | 상담사 이름 (상담사 마스터 테이블 신설 후 제공 — v3 스키마) |
| `period` | string | 요청한 기간 값 에코 (`30d`/`90d`/`all`) |
| `period_from` / `period_to` | string(date) | 실제 조회 구간. `all`이면 `period_from`은 최초 상담일 |
| `generated_at` | string(date-time) | 응답 생성 시각 |
| `rubric_version` | string | `"v1.5"` |
| `thresholds.item_rate_warn` | number | 이 값 **미만** → `"개선 필요"` (기본 60) |
| `thresholds.item_rate_ok` | number | 이 값 **이상** → `"양호"`, 사이는 `"보통"` (기본 80) |

### 3.2 `summary` — 상단 카드 + 배지

| 필드 | 타입 | 카드 | 설명 |
|---|---|---|---|
| `evaluation_count` | number | 채점 건수 | 기간 내 이 상담사의 평가 건수 |
| `total_evaluation_count` | number | (화면 표기 보류) | 기간 내 전체(모든 상담사) 평가 건수 — **v1.2: 응답에는 유지, 화면 표기는 보류** (결정 8) |
| `avg_score` | number\|null | 평균 점수 | 환산총점(`final_score`)의 **건 단위 평균**. 0건이면 `null` |
| `risk_count` | number | 위험 건 | `risk_flagged = true` 건수 |
| `total_risk_count` | number | (화면 표기 보류) | 기간 내 전체 위험 건수 — **v1.2: 응답에는 유지, 화면 표기는 보류** (결정 8) |
| `weak_domain` | object\|null | 약점 배지 | 아래 참조. 적용 영역이 하나도 없으면 `null` |

> **v1.2에서 제거된 필드:** `team_avg_score`·`rank`·`agent_count` (결정 7).
> 서버는 이 키들을 더 이상 내려주지 않고, 프론트도 참조하지 않는다.

`weak_domain` 객체:

```json
{ "domain_code": "D", "domain_name": "보험특화(불완전판매 방지)", "label": "불완전판매 고지" }
```

- **선정 규칙:** 적용 건수가 있는 영역 중 **달성률 최저 영역**.
  동률이면 배점 합이 큰 영역 우선(리스크 가중: D30 > B26 > C18 > E14 > A12).
  단, **최저 영역 달성률이 `item_rate_ok` 이상이면 `null`(약점 없음)** —
  전 영역 우수 상담사에게 약점 배지를 달지 않는다 (화면③ 목업의 "약점 항목:
  없음" 행과 동일 의미. v1.1 보완).
- `label`은 화면③ 약점 항목 컬럼·화면④ 배지에 공통 사용하는 표시 문구
  (영역별 고정 매핑): A=`상담 도입` / B=`업무처리` / C=`태도·공감` /
  D=`불완전판매 고지` / E=`상담 마무리`
  ※ C는 영역명(`domain_name`)과 동일 문구로 통일. **C 영역에 '경청' 키워드
  사용 금지** — A영역(A3 경청 및 용건·니즈 파악)과 겹침 (팀 결정 2026-07-09, v1.3)

### 3.3 `domain_rates` — 스파이더 차트 (항상 5개, A→E 순 — **본인 값만**)

| 필드 | 타입 | 설명 |
|---|---|---|
| `domain_code` | string | `"A"`~`"E"` |
| `domain_name` | string | 예: `"상담 도입"` |
| `rate` | number\|null | 본인 획득률(%) = Σ획득점수 ÷ Σ배점 × 100 (**N/A 제외**, §4). 적용 0건이면 `null` |
| `applied_count` | number | 이 영역 항목이 1개 이상 적용된 평가 건수 |

> **v1.2에서 제거된 필드:** `team_rate` (팀 평균 점선 — 결정 7.
> 팀 비교는 개인 리포트에 넣을 개념이 아님).

> 차트에서 `rate: null`인 영역은 0으로 그리지 말 것 (0점과 "평가 상황 없음"은 다름).
> Chart.js는 데이터에 `null`을 주면 해당 꼭짓점을 비워서 그린다.

### 3.4 `items` — 항목별 상세 (항상 18개, A1→E2 루브릭 순)

| 필드 | 타입 | 설명 |
|---|---|---|
| `item_code` | string | `"A1"`~`"E2"` |
| `item_name` | string | 루브릭 v1.5 항목명 |
| `domain_code` | string | 소속 영역 (표의 영역 그룹 행 렌더링용) |
| `max_score` | number | 배점 (루브릭 v1.5 고정값) |
| `applied_count` | number | N/A 아닌 평가 건수 (달성률의 분모 모수) |
| `na_count` | number | `충족수준='해당없음'` 이었던 건수 |
| `avg_earned` | number\|null | 적용 건들의 획득점수 평균. `applied_count=0`이면 `null` |
| `rate` | number\|null | `avg_earned ÷ max_score × 100`. `applied_count=0`이면 `null` |
| `status` | string | `"양호"` / `"보통"` / `"개선 필요"` / `"해당없음"` (서버가 `thresholds`로 판정) |

**N/A 전달 방식 (팀 결정):** 항목을 배열에서 빼지 않는다.
적용 건수가 0인 항목은 이렇게 내려온다:

```json
{
  "item_code": "D2", "item_name": "적합성 원칙(절차+결과)", "domain_code": "D",
  "max_score": 5, "applied_count": 0, "na_count": 145,
  "avg_earned": null, "rate": null, "status": "해당없음"
}
```

→ 프론트는 `status === "해당없음"`이면 달성률 막대·수치 대신 `—`를 표시.

### 3.5 `improvement_items` — 개선 필요 항목 (0~5개, 달성률 오름차순)

| 필드 | 타입 | 설명 |
|---|---|---|
| `item_code` / `item_name` / `domain_code` | string | `items`와 동일 항목 참조 |
| `rate` | number | 달성률 (`items[].rate`와 동일 값) |
| `tip` | string\|null | 코칭 팁 문구. **항목코드별 정적 매핑**(서버 상수)에서 제공. 문구 미확정 항목은 `null` — 프론트는 `null`이면 팁 줄 생략 |

- **포함 규칙:** `rate < thresholds.item_rate_warn` 인 항목만, 오름차순, 최대 5개.
- 해당 항목이 없으면 빈 배열 `[]` → 프론트는 "개선 필요 항목 없음" 등 빈 상태 표시.

응답 최상위에 `improvement_items_total_count`(number, v1.3 추가)가 함께 내려간다 —
`rate < thresholds.item_rate_warn`에 해당하는 **전체** 항목 수(5개 초과분 포함). `improvement_items`는
여전히 최대 5개만 반환하므로, 프론트는 `improvement_items_total_count > improvement_items.length`일 때
"외 N건 더"를 표시해 목록이 잘려 있음을 사용자가 오인하지 않게 한다 (팀장 UI 컨펌 피드백 B, 2026-07-13).

---

## 4. 집계 규칙 (서버 구현 기준 — 수식 정본)

건 단위 채점의 환산총점 규칙(CLAUDE.md §8.1)과 **같은 원칙**을 집계에 적용한다:
**N/A(충족수준='해당없음')는 분자·분모 모두에서 제외한다.**

```
항목 달성률(%)  = Σ(획득점수 where level≠해당없음) ÷ Σ(배점 where level≠해당없음) × 100
              = avg_earned ÷ max_score × 100          ← 항목은 배점 고정이라 동치
영역 획득률(%)  = 영역 내 모든 적용 항목의 Σ획득점수 ÷ Σ배점 × 100
평균 점수      = AVG(final_score)   ← 건 단위 평균 (상담사 평균의 평균 아님)
위험 건       = COUNT(risk_flagged = true)
```

- 반올림: `round(x × 10) / 10` (소수 1자리) — 계산 마지막에 1회만.
- 전체 카운트(`total_evaluation_count`·`total_risk_count`)는 같은 기간 조건을 전체 평가 건에 적용.
  (v1.2: 팀 평균·팀 획득률 계산은 제거 — 결정 7. 화면③의 전체·상담사별 수치는
  이 §4 수식을 정본으로 공유한다 — 화면③ 계약 §1 결정 2)
- 데이터 원천: `ai_evaluation_details`(level·max_score·earned_score) ×
  `ai_evaluation_master`(final_score·risk_flagged) × `consultation_master`(agent_id·consulted_at).

---

## 5. 엣지 케이스 (프론트·백 공통 확인 목록)

| 상황 | 응답 |
|---|---|
| 기간 내 평가 0건 | `evaluation_count: 0`, `avg_score/weak_domain: null`, `items` 18개 전부 `해당없음`, `domain_rates` 전부 `rate: null`, `improvement_items: []` |
| 특정 항목 전 건 N/A (예: 신규판매 상담이 없어 D1~D5 전부) | 해당 항목만 `해당없음` 형태 (§3.4 예시) |
| 알 수 없는 `period` 값 | `400` + `{ "error": "invalid period" }` |

---

## 6. 남은 일 (이 계약과 연결된 후속 작업)

- [x] 상담사 마스터 테이블 신설 + `agent_name` 공급 (AXDB_v3 — 2026-07-05 완료.
      `agents` 테이블 + 더미 명부 시드, `consultation_master.agent_id` FK 전환,
      복합 인덱스 `idx_master_agent_date`. 정본: `scripts/schema.sql` /
      스냅샷: `lib/db/AXDB_v3.sql` / 접근: `lib/db/agentRepo.ts`)
- [x] `app_config`에 `item_rate_warn`(60)·`item_rate_ok`(80) 키 시드 추가 (2026-07-05, v3에 포함)
- [x] 집계 쿼리 + API 라우트 구현 (3순위 — 2026-07-05 완료.
      `lib/db/agentReportRepo.ts`(집계·리포트 빌더) +
      `app/api/agents/[agentId]/report/route.ts`. 시드 데이터로 통합 검증 완료)
- [x] 코칭 팁 정적 문구 18개 확정 (2026-07-16 전량 등록 — 정본: 코칭팁_문구_확정본_20260716.md,
      커밋 aa8e4d1. D1·D2·D4 기존 목업 초안 문구는 전량 교체)
- [x] 화면③(대시보드)용 API 계약은 별도 문서로 (2026-07-08 완료 —
      `화면3_상담사대시보드_API계약_v1.md`. 화면①·②용도 같은 날 확정:
      `화면1_채점결과목록_API계약_v1.md` / `화면2_채점상세_API계약_v1.md`)
- [x] v1.2 필드 제거를 서버 구현에 반영 (2026-07-09 완료 —
      `lib/db/agentReportRepo.ts`에서 팀 평균·팀 획득률·RANK 집계 삭제,
      예시 응답 `schemas/agent-report.v1.example.json`은 2026-07-08 선반영.
      `rank`·`agent_count`는 확정 삭제)
- [ ] 팀 비교(`team_avg_score`·`team_rate`) **재도입 여지 있음** (2026-07-09 결정) —
      추후 여유 시 "본인 vs 팀" 비교 기능으로 부활 가능. 재도입 시
      계약 버전 업(필드 복원 명시) → git 이력에서 서버 구현 복원 → 스텁 갱신 순서로.
      화면③ 대시보드의 전체 집계(같은 수식)도 참고 구현이 됨
- [ ] 화면④ 목업(`docs/mocksup/화면4_상담사평가리포트_목업.html`)이 아직 v1 필드
      (팀 점선·순위 카드·팀 평균 부제)를 그림 — FE 이식 시 v1.2 스텁 기준으로 갱신
- [ ] 표본 표기("전체 N건 중 M건") 재도입 여부 결정 — 현재 보류
      (데이터 규모가 커지면 화면만 복원, 응답 필드는 이미 있음)

> 주: 예시 응답의 `agent_id`는 목업 서사(김상담)를 따른 가상값이다.
> 실제 시드 명부는 `AGT-001 이지현 ~ AGT-006 김도연` + `unknown 미배정` —
> 화면 연동 테스트 시 이 ID를 사용할 것.

## 7. 변경 이력

| 버전 | 일자 | 내용 |
|---|---|---|
| v1 | 2026-07-05 | 최초 확정 — 키 표기 snake_case, N/A '해당없음' 전달(항목 유지), 기간 기준 consulted_at |
| v1.1 | 2026-07-05 | `weak_domain` 보완 — 최저 영역 달성률이 `item_rate_ok` 이상이면 `null`(약점 없음). 구현 중 발견: 전 영역 100% 상담사에게 동률 tie-break로 D영역 배지가 달리는 문제 방지 |
| v1.2 | 2026-07-08 | **코칭 도구 철학 반영** (인사고과·순위 줄세우기 배제, 약점 진단 중심 — 화면③ 공통). ① 필드 제거: `summary.rank`·`summary.agent_count`·`summary.team_avg_score`·`domain_rates[].team_rate`(팀 평균 점선) — 스파이더 차트는 본인 값만. ② 표본 표기("전체 N건 중 M건")는 화면에서 제외하되 `total_evaluation_count`·`total_risk_count` 응답 필드는 유지(재도입 보류). ③ '코멘트 남기기' 버튼 제거(화면②와 기능 중복) — UI 전용 요소라 이 계약의 필드에는 영향 없음. 유지 확정: 요약 카드(건수·평균·위험)·약점 배지·개선 필요 항목·18항목 표·스파이더(본인)·PDF·기간 필터 |
| v1.3 | 2026-07-09 | 약점 라벨 C 영역 통일 — `공감·경청` → `태도·공감` (영역명과 동일 문구). 이유: '경청'이 A영역(A3) 키워드와 겹침. 화면③ 계약 결정 4·화면② 영역명 주석·서버 상수 `WEAK_LABELS`(`lib/db/agentReportRepo.ts`)에 동시 반영 |
