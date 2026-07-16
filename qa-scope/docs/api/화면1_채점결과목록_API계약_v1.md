# 화면① 채점 결과 목록 — API 응답 계약 v2

> **목적:** 프론트엔드(화면① 목업 → Next.js 이식)와 백엔드(DB 조회)가
> 서로 기다리지 않고 병렬로 작업하기 위한 **데이터 약속 문서**다.
> 화면④ 계약(`화면4_상담사리포트_API계약_v1.md`)과 같은 원칙·표기를 따른다.
>
> 목업(`docs/mocksup/화면1_채점결과목록_목업.html`)의 배너에서 제안된
> `meta / summary / items` 형태를 그대로 확정한다.

---

## 0. 쉬운 설명 (개발 배경을 모르는 팀원용)

- 화면①은 "채점 완료된 상담 전체 목록"이다. 담당자가 **위험 건부터**
  검수할 수 있도록, 위험·저점 건이 위로 오게 정렬해서 내려준다.
- 상태 배지("불완전판매 의심"/"저점수"/"정상")와 빨간 위험 점(●)은
  **서로 다른 레이어**다 (CLAUDE.md §8.3·§8.4). 라벨이 "정상"이어도
  위험플래그가 하나라도 있으면 빨간 점이 켜져야 한다(초록불에 묻힘 방지).
- 이 판정을 프론트가 다시 계산하지 않는다. **서버가 `status_labels`
  (병기 배열)와 `risk_flagged`를 계산해서 내려주고, 프론트는 그리기만 한다.**
  (원칙 "계산은 코드가, 화면은 표시만" — CLAUDE.md §7)

---

## 1. 확정 결정 사항

| # | 결정 | 내용 · 이유 |
|---|---|---|
| 1 | **키 표기 = 영문 snake_case** | 앱 API 공통 규약 (화면④ 계약 결정 1과 동일) |
| 2 | **상태라벨은 병기 배열 `status_labels`로 전달** | DB에는 우선순위 1개만 저장되지만(§8.3: 불완전판매 의심 > 저점수), 화면①은 둘 다 해당 시 병기해야 함 → 서버가 배열로 계산해 전달. 순서 고정: `["불완전판매 의심", "저점수"]` (불완전판매 의심 먼저 — v14 팀 결정) |
| 3 | **`risk_flagged`는 라벨과 별개 필드** | 위험플래그 1개↑ = `true` → 빨간 점 + 행 배경. 라벨 "정상"이어도 켜질 수 있음 (§8.4 안전망 — 회귀 케이스 §10.4) |
| 4 | **기본 정렬 = 위험·저점 우선** | `risk_flagged` DESC → 상태라벨 순위(불완전판매 의심→저점수→정상) → `final_score` ASC. "담당자가 먼저 볼 것부터" 원칙 |
| 5 | **날짜 필터 기준 = 상담일(`consulted_at`)** | 화면③·④와 동일 기준 (평가 실행일 아님) |
| 6 | **`consult_type`은 AI 판정 유형** | 3-A의 `consult_type_ai`. 입력 원본 유형(`consultation_master.consultation_type`)이 아니라 채점 파이프라인이 확정한 유형을 화면에 표시 |
| 7 | **저점수 컷은 조회 시점 `app_config` 값 사용** | `status_labels`의 "저점수" 병기 여부는 조회 시점 `low_score_cut`으로 판정. 컷 변경 시 과거 건의 병기 여부가 달라질 수 있음(단독 저장 라벨 `status_label`은 평가 시점 값 유지) — §5 주의 참조 |

---

## 2. 엔드포인트

```
GET /api/evaluations?date_from=2026-06-01&date_to=2026-06-30&agent_id=AGT-003&consult_type=신규·보장&status=저점수&sort=risk&limit=50&offset=0
```

| 파라미터 | 위치 | 값 | 기본값 | 설명 |
|---|---|---|---|---|
| `date_from` / `date_to` | query | `YYYY-MM-DD` | 없음(전체) | 상담일(`consulted_at`) 범위. 단일 날짜는 from=to로 |
| `agent_id` | query | 명부 ID (예: `AGT-003`) | 없음(전체) | 상담사 필터 |
| `consult_type` | query | 5종 ENUM (신규·보장 등) | 없음(전체) | AI 판정 상담유형 필터 |
| `status` | query | `불완전판매 의심` \| `저점수` \| `정상` | 없음(전체) | **DB 저장 단일 라벨**(`status_label`) 기준 필터 |
| `review_status` | query | `미검수`/`검수중`/`확정` | 없음(전체) | 검수 상태 필터 |
| `risk_flagged` | query | `true` \| `false` | 없음(전체) | 위험 플래그 필터. `true`=위험 건만 / `false`=비위험 건만 / 미지정·빈 값=전체 |
| `sort` | query | `risk` \| `date` | `risk` | `risk`=결정 4의 위험·저점 우선 / `date`=상담일 최신순 |
| `limit` / `offset` | query | number | `50` / `0` | 페이지네이션. `limit` 최대 200 |

- `review_status` 동작 노트: 잘못된 값 → `400` + `{ "error": "invalid review_status" }`. `'미검수'` 필터 = 검수 행(`evaluation_reviews`)이 `NULL`인 것.

- `risk_flagged` 동작 노트:
  - 허용 값은 문자열 `'true'`/`'false'`. 그 외 값 → `400` + `{ "error": "invalid risk_flagged" }`
  - 빈 문자열(`risk_flagged=`)은 미지정과 동일 처리 (서버가 `null` 정규화)
  - 미지정 시 WHERE 조건 미생성 (전체 조회)
  - UI 노출: 화면① 셀렉트는 "전체 / 위험만(`true`)" 2개만. `false`는 스펙상 지원, 현 UI 미노출

- 성공: `200` + 아래 §3 형태의 JSON
- 잘못된 파라미터(날짜 형식·미지원 sort 등): `400` + `{ "error": "<메시지>" }`
- 서버 오류: `500` + `{ "error": "<메시지>" }`

---

## 3. 응답 구조 (블록 3개)

화면 요소와의 대응:

| 응답 블록 | 화면① 요소 |
|---|---|
| `meta` | 필터 에코·생성 시각 |
| `summary` | 하단 요약 줄 ("전체 N건 · 위험 N건" + 필터 시 "· 조회 결과 N건") |
| `items` | 표 본문 (1행 = 평가 1건) |

### 3.1 `meta`

| 필드 | 타입 | 설명 |
|---|---|---|
| `filters` | object | 적용된 필터 에코 (`date_from`·`date_to`·`agent_id`·`consult_type`·`status`·`review_status`·`risk_flagged` — 미지정은 `null`) |
| `sort` | string | 적용된 정렬 (`risk`/`date`) |
| `limit` / `offset` | number | 페이지네이션 에코 |
| `generated_at` | string(date-time) | 응답 생성 시각 |

- `risk_flagged` 에코는 문자열 `'true'`/`'false'` 그대로(boolean 변환 없음), 미지정 `null`.

### 3.2 `summary` — 하단 요약 줄

| 필드 | 타입 | 화면 문구 | 설명 |
|---|---|---|---|
| `total_count` | number | "전체 **N**건" | **필터 무관** 전체 평가 건수 (`evaluator='AI_최종'`) |
| `risk_count` | number | "위험 **N**건" | **필터 무관** 전체 `risk_flagged=true` 건수 |
| `filtered_count` | number | "조회 결과 **N**건" — **조건부 표시** | 필터 적용 후 총 건수 (`limit`/`offset` 무관 — 페이지 계산용) |

**조건부 표시 규칙 (프론트 정본):**
"조회 결과" 조각은 `filtered_count !== total_count`이거나 필터 파라미터
(`date_from`/`date_to`/`agent_id`/`consult_type`/`status`/`review_status`/`risk_flagged`)
중 하나라도 truthy(빈 문자열 제외)일 때만 표시한다. 필터 미적용 시 요약줄은
"전체 N건 · 위험 N건" 두 조각만 표시한다. `sort`/`limit`/`offset`은 필터가
아니므로 활성 판정에서 제외한다.

### 3.3 `items` — 표 본문 (정렬·페이지 적용 후)

| 필드 | 타입 | 컬럼 | 설명 |
|---|---|---|---|
| `evaluation_id` | number | (보기 링크) | 평가 PK → 화면② `GET /api/evaluations/{evaluation_id}` 이동에 사용. **⚠ 재채점 시 새로 발급되므로 북마크·외부 저장 키로 쓰지 말 것** (재채점=덮어쓰기, 팀 결정 2026-07-06) |
| `consultation_code` | string | 상담번호 | 대외 코드 (예: `dummy_01`) |
| `agent_id` | string | — | 상담사 ID. 미배정 건은 `"unknown"` |
| `agent_name` | string | 상담사 | 명부(`agents`) 표시 이름. `unknown`은 `"미배정"` |
| `consulted_at` | string(date-time) | (날짜 필터 근거) | 상담 시작 일시 |
| `consult_type` | string\|null | 유형 | AI 판정 유형 (결정 6). 미판정 `null` → 프론트는 `—` 표시 |
| `final_score` | number | 총점 | 환산총점, 소수 1자리 (예: `65.9`) |
| `risk_flagged` | boolean | 상태(빨간 점) | `true`면 빨간 점 + 행 배경 `risk-row` |
| `status_label` | string | — | DB 저장 단일 라벨 (필터 값과 대응 — 표시용은 아래 배열 사용) |
| `status_labels` | string[] | 상태(배지) | 병기 배열 (결정 2·7). 1~2개, 항상 이 중 하나: `["정상"]` / `["저점수"]` / `["불완전판매 의심"]` / `["불완전판매 의심","저점수"]` |
| `review_status` | string | 검수(배지) | `미검수`/`검수중`/`확정`. 서버가 `evaluation_reviews` LEFT JOIN 후 판정. 행 없으면 `미검수` |

**`status_labels` 판정 규칙 (서버 계산 — 정본):**

```
불완전판매 의심 = (저장된 status_label == '불완전판매 의심')
저점수        = (final_score < 조회 시점 low_score_cut)    ← app_config, 하드코딩 금지
둘 다 아니면  = ["정상"]
```

---

## 4. 엣지 케이스 (프론트·백 공통 확인 목록)

| 상황 | 응답 / 표시 |
|---|---|
| 채점 건 0건 (필터 결과 없음 포함) | `items: []`, `filtered_count: 0` → 프론트는 "조건에 맞는 상담이 없습니다" 빈 행 |
| **총점 ≥ 컷 + 플래그 3·4만 있는 건** (§10.4 필수 확인) | `status_labels: ["정상"]` **이면서** `risk_flagged: true` → 빨간 점 필수 |
| 병기 건 (불완전판매 의심 + 저점수) | `status_labels: ["불완전판매 의심","저점수"]` — 이 순서 그대로 렌더 |
| 컷값 변경 후 과거 건 | `status_labels`의 저점수 여부는 새 컷 기준으로 재판정됨. `status_label`(저장값)과 어긋날 수 있음 — 정상 동작 (결정 7) |
| `limit` > 200 | `400` + `{ "error": "limit too large" }` |
| `date_from` > `date_to` | `400` + `{ "error": "invalid date range" }` |
| `risk_flagged`에 `true`/`false` 외 값 | `400` + `{ "error": "invalid risk_flagged" }` |
| `risk_flagged=` (빈 값) | 미지정과 동일 — 전체 조회 |
| 검수 기록 없는 평가 | `review_status: "미검수"` (LEFT JOIN NULL) |
| `review_status` 필터 + 결과 0건 | `items: []` → 빈 상태 안내 |

---

## 5. 남은 일 (이 계약과 연결된 후속 작업)

- [x] `listForDashboard()` 확장 (`lib/db/evaluationRepo.ts`):
      `agents` JOIN(`agent_name`), 필터 4종(date·agent·type·status),
      `risk_flagged DESC` 정렬 선두 추가(현재는 status_label 우선만 구현),
      `sort=date` 분기 (2026-07-09 완료 — `countForDashboard()` 신설 포함)
- [x] 라우트(`app/api/evaluations/route.ts`) 응답을 배열 → `{ meta, summary, items }`로 변경
      + `status_labels` 계산(조회 시점 `low_score_cut` 로드 — `lib/db/statusLabels.ts` 공용 헬퍼,
      화면②와 단일 구현. 프론트 스텁: `schemas/evaluations-list.v1.example.json`.
      §10.4 케이스는 `npm run db:seed-edge`(edge_104)로 시드 재현 — 2026-07-09 완료)
- [ ] 목업의 프론트 측 `computeStatus()` 제거 — 서버 값 그대로 표시로 교체
- [ ] 화면① 목업 데이터 필드명(`consultation_id` 등)을 이 계약(`consultation_code`)에 맞춰 정리

## 6. 변경 이력

| 버전 | 일자 | 내용 |
|---|---|---|
| v1 | 2026-07-08 | 최초 확정 — meta/summary/items 3블록, 상태 병기 `status_labels` 서버 계산, 위험·저점 우선 정렬, 날짜 기준 consulted_at |
| v2 | 2026-07-16 | ① risk_flagged 필터 신설 (true/false, 400 검증, meta 에코) ② §3.1 filters 에코 7종으로 갱신 ③ §4 엣지 케이스 2행 추가 ④ 요약줄 개편: "전량→전체", "표시 중→조회 결과", 조회 결과 조각은 필터 활성 시에만 조건부 표시 ⑤ review_status 필터·필드·엣지 케이스는 검수기능 개정안 v2(07-11 기확정)를 본 개정에서 문서 반영 |
