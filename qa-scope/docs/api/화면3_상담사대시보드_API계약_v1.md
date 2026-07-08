# 화면③ 상담사별 대시보드 — API 응답 계약 v1

> **목적:** 프론트엔드(화면③ 목업 → Next.js 이식)와 백엔드(집계 쿼리)가
> 병렬로 작업하기 위한 **데이터 약속 문서**다.
> 화면④ 계약(`화면4_상담사리포트_API계약_v1.md`)의 후속 문서로,
> **집계 수식·기간 기준·약점 선정 규칙을 화면④와 전부 공유**한다.
> 화면③의 어떤 수치도 화면④(같은 기간)와 어긋나면 버그다.

---

## 0. 쉬운 설명 (개발 배경을 모르는 팀원용)

- 화면③은 "상담사 전원의 성적 요약표"다. 화면④가 상담사 1명을 깊게
  보여준다면, 화면③은 전원을 얕게 훑고 → 이름 클릭 시 화면④로 들어간다.
- 그래서 화면③의 한 행(상담사 1명)에 있는 값들은 화면④ 응답에서
  이미 정의한 값들의 **부분집합**이다: 건수 = ④의 `evaluation_count`,
  평균 = ④의 `avg_score`, 위험 = ④의 `risk_count`, 약점 = ④의 `weak_domain`.
  같은 값이므로 **같은 서버 로직**(`lib/db/agentReportRepo.ts`)으로 계산한다.
- 약점 항목·평균·위험 판정을 프론트가 재계산하지 않는다. 서버가 계산해서
  내려준다 (화면③과 ④가 어긋나는 것 방지 — 화면④ 계약 결정 5와 동일).

---

## 1. 확정 결정 사항

| # | 결정 | 내용 · 이유 |
|---|---|---|
| 1 | **키 표기 = 영문 snake_case** | 앱 API 공통 규약 |
| 2 | **집계 정본 = 화면④ 계약 §4** | 기간 기준(`consulted_at`)·건 단위 평균·N/A 제외 수식·소수 1자리 반올림 전부 화면④와 동일. 이 문서에 수식을 중복 기재하지 않는다 |
| 3 | **상단 "전체 평균" = 건 단위 평균** | 화면④ 계약 §4의 "평균 점수" 수식(`AVG(final_score)` — 상담사 평균의 평균 아님)을 기간 내 전체 평가 건에 적용한 값. 목업의 "건 단위 가중평균" 부제와 동일 의미. ※ ④ v1.2에서 `team_avg_score` 필드 자체는 제거됨 — 공유하는 것은 **수식 정본**이지 필드가 아님 |
| 4 | **`weak_domain`은 화면④ §3.2와 동일 객체·동일 규칙** | 최저 달성률 영역, 동률 시 배점 합 큰 영역(D30>B26>C18>E14>A12), 최저 영역이 `item_rate_ok` 이상이면 `null`(약점 없음). `label` 매핑도 동일: A=`상담 도입` / B=`업무처리` / C=`태도·공감` / D=`불완전판매 고지` / E=`상담 마무리` |
| 5 | **행 정렬 = 평균점수 내림차순, 순위 숫자는 표시하지 않음** | 정렬은 표시 순서일 뿐이며 순위·등수를 계산·표시하지 않는다 — 화면③·④는 인사고과(순위 줄세우기)가 아니라 **코칭(약점 진단) 도구** (팀 결정 2026-07-08, ④ v1.2 결정 7과 공통). 동점은 같은 평균끼리 `agent_id` 오름차순(표시 안정성) |
| 6 | **`unknown`(미배정)도 한 행으로 포함** | 전량 채점 원칙 — 미배정 건이 합계에서 빠지면 상단 카드와 화면① 총계가 어긋남. `agent_name: "미배정"`, 리포트 링크는 비활성 권장 |
| 7 | **이름 클릭 시 `period`를 그대로 전달** | 화면④ 진입 시 `GET /api/agents/{agent_id}/report?period=<동일값>` — ③에서 본 수치가 ④에서 그대로 재현되게 |

---

## 2. 엔드포인트

```
GET /api/agents/summary?period=30d
```

| 파라미터 | 위치 | 값 | 기본값 | 설명 |
|---|---|---|---|---|
| `period` | query | `30d` \| `90d` \| `all` | `30d` | 조회 기간 — 화면④와 동일 값·동일 의미 (상담일 기준) |

- 성공: `200` + 아래 §3 형태의 JSON
- 알 수 없는 `period`: `400` + `{ "error": "invalid period" }`
- 서버 오류: `500` + `{ "error": "<메시지>" }`

> Next.js 라우팅 주의: `/api/agents/summary`는 동적 라우트
> `/api/agents/[agentId]/…`보다 정적 라우트가 우선 매칭되므로 충돌 없음
> (명부에 `summary`라는 agent_id를 만들지 않는다는 전제).

---

## 3. 응답 구조 (블록 3개)

화면 요소와의 대응:

| 응답 블록 | 화면③ 요소 |
|---|---|
| `meta` | 기간 표시 |
| `summary` | 상단 통계 카드 4개 |
| `agents` | 상담사 표 (1행 = 상담사 1명) |

### 3.1 `meta`

| 필드 | 타입 | 설명 |
|---|---|---|
| `period` | string | 요청한 기간 값 에코 (`30d`/`90d`/`all`) |
| `period_from` / `period_to` | string(date)\|null | 실제 조회 구간. `all`이면 `period_from`은 (평가가 있는) 최초 상담일, 평가 0건이면 `null` |
| `generated_at` | string(date-time) | 응답 생성 시각 |
| `rubric_version` | string | `"v1.5"` |

### 3.2 `summary` — 상단 카드 4개

| 필드 | 타입 | 카드 | 설명 |
|---|---|---|---|
| `avg_score` | number\|null | 전체 평균 | 기간 내 전체 평가 건의 건 단위 평균 (결정 3 — ④ §4 수식 공유). 0건이면 `null` |
| `evaluation_count` | number | 채점 건수 | 기간 내 전체 평가 건수 (④의 `total_evaluation_count`와 동일 값) |
| `risk_count` | number | 위험 건 | 기간 내 전체 `risk_flagged = true` 건수 (④의 `total_risk_count`와 동일 값) |
| `agent_count` | number | 상담사 수 | 기간 내 평가 1건 이상 보유 상담사 수 = `agents` 배열 길이 (③ 전용 필드 — ④에서는 v1.2에서 제거됨) |

> 목업처럼 프론트가 표에서 합산하지 않는다 — 서버가 **같은 쿼리 기준**으로
> 내려주는 이 값을 그대로 표시 (페이지네이션·행 생략이 생겨도 카드가 안 흔들리게).

### 3.3 `agents` — 상담사 표 (평균점수 내림차순, 평가 1건 이상 보유자만)

| 필드 | 타입 | 컬럼 | 설명 |
|---|---|---|---|
| `agent_id` | string | (링크) | 상담사 ID → 화면④ `GET /api/agents/{agent_id}/report?period=<동일값>` (결정 7) |
| `agent_name` | string | 상담사 | 명부 표시 이름. `unknown`은 `"미배정"` (결정 6) |
| `evaluation_count` | number | 건수 | 기간 내 이 상담사의 평가 건수 (④ `summary.evaluation_count`와 동일 값) |
| `avg_score` | number\|null | 평균점수(막대) | 건 단위 평균, 소수 1자리 (④ `summary.avg_score`와 동일 값). 표에는 1건 이상 보유자만 오므로 실질 `null` 없음 — 타입만 ④와 통일 |
| `risk_count` | number | 위험 | `risk_flagged = true` 건수 (④ `summary.risk_count`와 동일 값) |
| `weak_domain` | object\|null | 약점 항목 | ④ `summary.weak_domain`과 동일 객체(`domain_code`·`domain_name`·`label`)·동일 규칙 (결정 4). `null`이면 "없음" 표시 |

`weak_domain` 예시 (화면④ 계약 §3.2와 동일):

```json
{ "domain_code": "D", "domain_name": "보험특화(불완전판매 방지)", "label": "불완전판매 고지" }
```

---

## 4. 화면①·③·④ 수치 정합 표 (교차 검증용)

같은 기간이라면 아래 값들은 반드시 일치해야 한다. 통합 테스트 체크리스트로 사용.

| 값 | 화면① | 화면③ | 화면④ |
|---|---|---|---|
| 전체 평가 건수 | `summary.total_count` (기간 필터 없을 때) | `summary.evaluation_count` | `summary.total_evaluation_count` (응답 유지 — 화면 표기는 보류) |
| 전체 위험 건수 | `summary.risk_count` (〃) | `summary.risk_count` | `summary.total_risk_count` (〃) |
| 전체 평균 | — | `summary.avg_score` | — (④ v1.2에서 `team_avg_score` 제거 — ③값을 ④ §4 수식으로 직접 검산) |
| 상담사 건수·평균·위험·약점 | — | `agents[]` 각 필드 | `summary`의 대응 필드 (`evaluation_count`·`avg_score`·`risk_count`·`weak_domain`) |

> 주의: 화면①의 총계는 기간 개념이 없는 "전량" 기준이므로, ③·④와 비교할 때는
> `period=all` 기준으로 대조할 것.

---

## 5. 엣지 케이스

| 상황 | 응답 |
|---|---|
| 기간 내 평가 0건 | `summary`: `avg_score: null`, 나머지 카운트 `0` / `agents: []` → 프론트는 빈 상태 표시 |
| 상담사 1명뿐 | `agents` 1행, `summary.avg_score` = 그 상담사의 `avg_score` |
| 전 영역 우수 상담사 | `weak_domain: null` → "없음" (약점 배지 강제로 달지 않음 — ④ v1.1 보완과 동일) |
| 기간 내 평가는 있으나 전부 `unknown` 배정 | `agents`에 `unknown` 1행 (결정 6), `agent_count: 1` |
| 알 수 없는 `period` | `400` + `{ "error": "invalid period" }` |

---

## 6. 남은 일 (이 계약과 연결된 후속 작업)

- [ ] `GET /api/agents/summary` 라우트 + 집계 구현 —
      `lib/db/agentReportRepo.ts`의 기간 파싱(`periodFromDate`)·집계 쿼리·
      `weak_domain` 선정 로직을 **재사용**할 것 (별도 재구현 금지 — ③↔④ 불일치 방지)
- [ ] 화면③ 목업 이식 시 프론트 측 합산(`reduce`) 제거 → `summary` 값 직표시로 교체
- [ ] §4 정합 표를 시드 데이터 통합 테스트 케이스로 등록

## 7. 변경 이력

| 버전 | 일자 | 내용 |
|---|---|---|
| v1 | 2026-07-08 | 최초 확정 — 화면④ 집계 정본 공유, 신규 엔드포인트 `/api/agents/summary`, unknown 포함·평균 내림차순 정렬, ①③④ 정합 표 |
| v1.1 | 2026-07-08 | 화면④ v1.2(코칭 도구 철학 — 순위·팀 비교 제거) 반영 — ④에서 삭제된 `team_avg_score`·`rank`·`agent_count` 참조 정리, "순위 숫자 미표시" 원칙 명문화 (결정 5). ③의 응답 필드 자체는 변경 없음 |
