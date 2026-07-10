# DB 필드 구조 요약 (스키마 v5) — 엔진·RAG 담당자용

> 정본 DDL: `scripts/schema.sql` (= `lib/db/AXDB_v5.sql` 스냅샷) · DBMS: MySQL 8.0 · 스키마명 `qa_scope`
> 이 문서는 채점 파이프라인 관점에서 "어느 단계가 어느 테이블을 읽고 쓰는지"를 중심으로 정리한 것.
> (파일명의 `v4`는 링크 안정성을 위해 유지 — 내용은 v5 기준. 버전별 변경은 §3 참조.
> v4의 핵심: **재채점 = 덮어쓰기** — 테이블 구조 변화는 3-E `stage` ENUM 1개뿐, 나머지는 정책·규약.
> v5의 핵심: **사람 검수 레이어(3-F·3-G) 신설** — AI 테이블은 불변, 검수는 얹는 레이어.
> 재채점은 확정 검수 건을 기본 스킵 — `검수_쓰기_API계약_v1.md`가 정본)

---

## 0. 한눈에 보는 관계도

```
agents (0. 상담사 마스터) ★v3 신설
  └─< consultation_master (1. 상담)          ← 엔진 입력의 헤더
        ├─< consultation_dialogues (2. 발화)  ← 엔진 입력 본문 (transcript)
        ├─< ai_evaluation_master (3-A. 평가 헤더)   ← 엔진 최종 출력 (상담당 주체별 1건)
        │     ├─< ai_evaluation_details (3-B. 18항목)
        │     │     └─< ai_evaluation_evidences (3-D. 근거 인용) ──→ consultation_dialogues (점프 링크)
        │     ├─< ai_evaluation_risk_flags (3-C. 위험 플래그)
        │     └─< evaluation_reviews (3-F. 검수 헤더 ★v5)   ← 사람 검수 — 평가당 최대 1건
        │           └─< evaluation_review_overrides (3-G. 항목 충족수준 수정 ★v5)
        └─< ai_evaluation_verify_log (3-E. 검증 로그)  ← 3중 안전망 이력 (실패 시도 + ★v4 정본교체 + ★v5 검수폐기 보존 포함)

app_config (설정 — 컷값·임계값)
```

`─<` = 1:N. 모든 자식은 `ON DELETE CASCADE` (예외: evidences→dialogues는 SET NULL, master→agents는 RESTRICT).

---

## 1. 파이프라인 ↔ 테이블 매핑 (엔진 담당자가 볼 핵심)

| 파이프라인 단계 | 동작 | 테이블 |
|---|---|---|
| ① 입력 로드 | 상담 1건 + 발화 배열 읽기 | `consultation_master` + `consultation_dialogues` |
| ①.5~② 채점 (LLM) | — (DB 접근 없음. RAG는 Chroma) | — |
| ③④⑤ 3중 검증 | 시도×단계별 로그 기록 (실패 시도 포함) | `ai_evaluation_verify_log` |
| ⑦ 계산 (코드) | 집계 재계산 — LLM 산수 미신뢰 | (메모리 — 저장은 다음 단계) |
| ⑧ 저장 | 검증 통과본 1건을 트랜잭션 저장. ★v4: 재채점이면 같은 트랜잭션 안에서 기존 정본을 3-E에 보존 후 삭제(덮어쓰기) | `ai_evaluation_master` + `details` + `evidences` + `risk_flags` (+ 재채점 시 `verify_log`) |

- 저장 진입점: `lib/db/persist.ts → persistEvaluation()`.
  ★v4 재채점 덮어쓰기는 `evaluationRepo.saveFinalEvaluation()`이 **트랜잭션 안에서** 처리한다
  (기존 정본의 `ai_output_json`을 3-E `stage='정본교체'` 행에 보존 → DELETE(자식 CASCADE) → 새로 INSERT).
  **호출부에서 기존 평가를 미리 지우지 말 것** — 보존 로직이 무력화된다 (persist.ts 머리말 참조)
- ★v5 재채점 × 검수 충돌 규약 (검수_쓰기_API계약_v1.md 결정 3):
  **확정 검수(3-F `review_status='확정'`) 존재 건은 배치 재채점에서 기본 스킵** —
  score-all 등 배치는 **채점 시작 전** 사전 조회로 건너뛴다 (LLM 호출 낭비 방지).
  강제 재채점은 `onConfirmedReview='force'` 명시 시에만. 3-F 행이 지워지는
  모든 경로(force·검수중 건 재채점·검수 철회)는 삭제 직전 3-E에
  `stage='검수폐기'` 행으로 검수 전문(`candidate_json`)을 보존한다 — 보존 없는 삭제 금지
- **컷값·임계값은 `app_config`에서 로드** (`lib/db/configRepo.ts`) — 코드 하드코딩 금지
- **RAG(Chroma)는 MySQL과 무관**: 임베딩·검색 대상은 `docs/rag/`의 약관·상품설명서뿐.
  `docs/hard/`(루브릭·매칭표·N/A규칙)는 인덱싱 금지 — 프롬프트 인라인 전용 (CLAUDE.md §14)

---

## 2. 테이블별 필드

### 0. `agents` — 상담사 마스터 (★v3 신설)

| 필드 | 타입 | 설명 |
|---|---|---|
| `agent_id` | VARCHAR(20) **PK** | 자연키 (예: `AGT-001`). 특수값 `unknown` = 미배정 |
| `agent_name` | VARCHAR(50) | 표시 이름 |
| `team_name` | VARCHAR(50) NULL | (예비) 소속 팀 |
| `is_active` | TINYINT(1) def 1 | 퇴사자는 삭제 대신 0 (이력 보존) |
| `created_at` | DATETIME | |

> **엔진 영향(v3 유일한 행동 변화):** `consultation_master.agent_id`가 이 테이블 FK가 됨.
> 상담을 새로 INSERT하는 코드는 명부에 없는 ID를 쓰면 실패한다.
> → `persist.ts`가 `ensureAgent()`로 자동 보호하므로 **기존 파이프라인 코드는 수정 불요.**
> 시드 명부: AGT-001 이지현 / 002 이준호 / 003 박소영 / 004 정유나 / 005 한지원 / 006 김도연

### 1. `consultation_master` — 상담 (엔진 입력 헤더)

| 필드 | 타입 | 설명 |
|---|---|---|
| `consultation_id` | INT UNSIGNED **PK** AI | 내부 대리키 |
| `consultation_code` | VARCHAR(30) UNIQUE | 대외 코드 (더미는 `dummy_01` 등 — 채점 스크립트의 상담ID와 동일) |
| `agent_id` | VARCHAR(20) **FK→agents** | ★v3 FK 전환 |
| `customer_id` | VARCHAR(20) | 식별자만 (PII 저장 금지) |
| `consulted_at` | DATETIME | 상담 시작 일시 (초 단위) |
| `consultation_type` | ENUM(신규·보장/계약변경/해지·환급/보험금청구/단순문의) NULL | 입력에 있으면 채움. **AI 분류 결과는 여기가 아니라 3-A에 저장** |
| `created_at` | DATETIME | |

인덱스: `agent_id` / `consulted_at` / ★v3 복합 `(agent_id, consulted_at)` — 화면④ 집계용

### 2. `consultation_dialogues` — 발화 (엔진 입력 본문)

| 필드 | 타입 | 설명 |
|---|---|---|
| `dialogue_id` | INT UNSIGNED **PK** AI | |
| `dialogue_code` | VARCHAR(40) UNIQUE NULL | 대외 발화 코드 (예: `dummy_01-002`). **평가 JSON의 `근거.대화ID`와 매칭되는 값** |
| `consultation_id` | FK→master (CASCADE) | |
| `turn_order` | INT UNSIGNED | 상담 내 순서. UNIQUE(consultation_id, turn_order) |
| `speaker` | ENUM('상담사','고객') | STT 화자분리 결과 — 채점의 핵심 축 |
| `spoken_at` | DATETIME | 발화 시각 (초 단위 필수) |
| `offset_sec` | INT UNSIGNED NULL | 상담 시작 기준 상대 초 (더미 `[00:05]` 표기 적재용) |
| `content` | TEXT | 발화 원문 — **인용 대조(안전망②)의 원본** |

### 3-A. `ai_evaluation_master` — 평가 헤더 (엔진 최종 출력)

출력스키마 ver2의 [평가메타/분류/판매정보/집계/고객만족/요약/종합피드백]을 1행에 담는다.
**UNIQUE(consultation_id, evaluator)** — 상담당 주체별 1건. 모니터링 AI 소견은 여기 안 만들고 3-E 로그로.

> **★v4 재채점 = 덮어쓰기 (팀 결정 2026-07-06):** 같은 (상담, 주체)를 다시 채점하면
> 기존 행을 3-E에 보존한 뒤 삭제하고 새로 INSERT한다. 전부 한 트랜잭션이라
> "이전은 지웠는데 새 저장 실패" 공백은 생기지 않는다.
> ⚠ `evaluation_id`는 재채점마다 **새로 발급**된다 — 외부 참조·북마크 키로 쓰지 말 것
> (화면①·② API 계약에도 동일 경고 명시).

| 그룹 | 필드 | 타입·설명 |
|---|---|---|
| 키 | `evaluation_id` | PK AI |
| | `consultation_id` | FK→master (CASCADE) |
| 평가메타 | `evaluator` | ENUM('AI_최종','사람_골든셋') |
| | `ai_model` | VARCHAR(60) NULL — 앱이 주입 (모델 자기보고 미신뢰) |
| | `rubric_version` | VARCHAR(10) (예: 'v1.5') |
| | `evaluated_at` | DATETIME def NOW |
| | `verify_attempts` | TINYINT — 몇 번째 시도가 검증 통과했나 |
| 분류 | `consult_type_ai` | ENUM 5종 — AI 판정 상담유형 |
| | `consult_type_basis` | TEXT — 판정 근거 |
| | `recommend_type` | ENUM('없음','신규판매','유지·해지방어·승환') — **D영역 N/A 스위치** |
| | `recommend_basis` | TEXT |
| 판매정보 (신규판매만, 그 외 전부 NULL) | `product_code` | ENUM P1~P7 |
| | `product_name` | VARCHAR(60) |
| | `needs_scenario` | ENUM N1~N8 NULL — 판단불가 시 NULL |
| | `matching_verdict` | ENUM('적합','부적합','명백한 오류') — D2 결과축 |
| | `checked_purpose` / `checked_finance` / `checked_existing` | TINYINT(1) — D2 절차축 3-bool (true 개수 → 3×3 게이트) |
| | `verdict_basis` | TEXT |
| 집계 (★앱이 재계산해 저장 — AI 반환값 그대로 넣지 말 것) | `raw_score_sum` | DECIMAL(5,1) 원점수합 |
| | `applied_max_sum` | DECIMAL(5,1) 적용배점합 (N/A 배점 제외 분모) |
| | `final_score` | DECIMAL(4,1) 환산총점 |
| | `risk_flagged` | TINYINT(1) — 플래그 1개↑면 1 |
| | `status_label` | ENUM('정상','불완전판매 의심','저점수') |
| 고객만족 | `csat_grade` / `csat_score` / `csat_basis` | ENUM 5등급 / TINYINT(≤100) / TEXT |
| 텍스트 | `summary` / `overall_feedback` | TEXT — 요약·종합피드백 |
| 감사 | `ai_output_json` | JSON — AI 원본 전문 보존 (재계산·분쟁 대조용) |

### 3-B. `ai_evaluation_details` — 항목별 평가 (평가 1건 = 정확히 18행)

| 필드 | 타입 | 설명 |
|---|---|---|
| `detail_id` | PK AI | |
| `evaluation_id` | FK→3-A (CASCADE) | UNIQUE(evaluation_id, item_code) |
| `item_code` | ENUM A1~E2 (18개) | |
| `level` | ENUM('충족','부분충족','미충족','해당없음') | **N/A도 행을 지우지 않고 '해당없음'으로 저장** |
| `max_score` | DECIMAL(3,1) | 배점 — 루브릭 v1.5 고정값 (`lib/scoring/constants.ts`의 MAX_SCORES가 정본) |
| `earned_score` | DECIMAL(3,1) | 충족=배점 / 부분충족=배점÷2(2.5 가능) / 미충족·해당없음=0. **AI값이 아닌 규칙값 저장.** CHECK(earned≤max) |
| `comment` | TEXT NULL | 판정 코멘트 |

### 3-C. `ai_evaluation_risk_flags` — 위험 플래그 (감지된 것만, 없으면 0행)

| 필드 | 타입 | 설명 |
|---|---|---|
| `flag_id` | PK AI | |
| `evaluation_id` | FK→3-A (CASCADE) | |
| `rule_number` | TINYINT (CHECK 1~6) | 1=D6위반 / 2=D1핵심누락(원금손실 실재 상품만) / 3=B1오정보 / 4=C3+강한불만 / 5=D득점률<50%(신규판매만) / 6=D2 명백한 오류 |
| `related_item_code` | ENUM A1~E2 NULL | |
| `basis` | TEXT | 발동 근거 |

### 3-D. `ai_evaluation_evidences` — 근거 인용 ("점수 클릭→원문 점프"의 연결고리)

| 필드 | 타입 | 설명 |
|---|---|---|
| `evidence_id` | PK AI | |
| `detail_id` | FK→3-B (CASCADE) | 항목 1개에 근거 여러 개 가능 |
| `dialogue_id` | FK→dialogues **NULL 허용** (SET NULL) | 인용 대조(안전망②)로 확정된 발화. 못 찾으면 NULL |
| `quote` | TEXT | 원문 그대로 인용 (요약·각색 금지) |

### 3-E. `ai_evaluation_verify_log` — 3중 검증 로그 (시도×단계 = 1행)

| 필드 | 타입 | 설명 |
|---|---|---|
| `log_id` | PK AI | |
| `consultation_id` | FK→master | 실패 시도도 상담에 귀속 (3-A에 행이 없으므로) |
| `evaluation_id` | FK→3-A NULL | 최종 통과본 저장 후 역참조로 채움. `정본교체` 행은 NULL 유지 (가리키던 정본이 삭제됨) |
| `attempt_no` | TINYINT | 채점 시도 회차. UNIQUE(consultation_id, attempt_no, stage). ★v4: **상담 기준으로 이어 센다** — 재채점 시 1부터 재시작 금지(UNIQUE 충돌). 다음 회차는 `verifyLogRepo.getNextAttemptNo()`로 받을 것 |
| `stage` | ENUM('형식검증','인용대조','교차검증',★v4 '정본교체',★v5 '검수폐기') | 안전망 ①②③ + 정본교체(재채점 덮어쓰기로 폐기된 이전 정본의 보존 행) + 검수폐기(재채점·철회로 삭제되는 3-F 검수의 보존 행) |
| `checker` | ENUM('코드','LLM') | ①②=코드, ③=LLM (정본교체·검수폐기=코드) |
| `checker_model` | VARCHAR(60) NULL | ③단계 검증 LLM 모델명 |
| `passed` | TINYINT(1) | |
| `issues` | TEXT NULL | 발견 문제 (형식 위반·불일치 인용·2차 LLM 이견). `정본교체` 행은 폐기 정본의 요약(evaluation_id·final_score·status_label 등) |
| `candidate_json` | JSON NULL | 해당 시도의 1차 채점 JSON (재시도 원인 추적용). `정본교체` 행은 **폐기된 정본의 `ai_output_json` 전문** |
| `created_at` | DATETIME | |

> 기존 v3 DB는 `scripts/schema.sql` 하단의 v4 마이그레이션 블록이 `stage` ENUM에
> `'정본교체'`를 조건부 ALTER로 추가한다 (ENUM 끝 값 추가 = MySQL 8 무중단, 재실행 안전).
> ★v5의 `'검수폐기'`도 같은 패턴의 v5 블록이 처리한다.

### 3-F. `evaluation_reviews` — 검수 헤더 (★v5 신설 — 사람 검수, 평가당 최대 1건)

정본 계약: `docs/api/검수_쓰기_API계약_v1.md`. **AI 원본 불변 원칙** — 검수는
3-A/3-B를 UPDATE하지 않고 이 레이어에 얹는다 (검증 경로는 항상 AI 원본만).

| 필드 | 타입 | 설명 |
|---|---|---|
| `review_id` | INT UNSIGNED **PK** AI | |
| `evaluation_id` | FK→3-A (CASCADE) UNIQUE | 대상 평가. 재채점 시 새 평가에 자동 승계하지 않음 |
| `review_status` | ENUM('검수중','확정') | '확정' = 배치 재채점 기본 스킵 보호. 확정→검수중 되돌림 허용 |
| `reviewer` | VARCHAR(64) | MVP: 자유 문자열 (인증 도입 시 FK 전환) |
| `review_comment` | TEXT NULL | 검수 코멘트 (화면② 하단) |
| `final_score_effective` | DECIMAL(4,1) | 검수 반영 환산총점 — **저장 시점 computeAggregates 재계산 물질화** (별도 산식 금지) |
| `status_label_effective` | ENUM 3종 | 검수 반영 상태라벨 (컷은 저장 시점 app_config — 3-A와 동일 의미론) |
| `risk_flagged_effective` | TINYINT(1) | 검수 반영 위험표시여부 |
| `reviewed_at` | DATETIME (ON UPDATE) | 마지막 검수 수정 시각 |

> 화면 ①~④는 `COALESCE(유효값, AI 원본)`으로 읽는다 (계약 결정 2 — 이원화).
> 쓰기 v0(확정+코멘트만) 단계에서는 유효값 = AI 값 복사라 화면 영향 없음.

### 3-G. `evaluation_review_overrides` — 항목별 충족수준 수정 (★v5 신설 — 쓰기 v1에서 기능 개방)

| 필드 | 타입 | 설명 |
|---|---|---|
| `override_id` | PK AI | |
| `review_id` | FK→3-F (CASCADE) | UNIQUE(review_id, item_code) — 수정한 항목만 행 존재 |
| `item_code` | ENUM A1~E2 | |
| `level_original` | ENUM 4택 | 수정 시점의 AI 판정 스냅샷 (감사 추적) |
| `level_override` | ENUM 4택 | 검수자 판정. **점수 컬럼 없음** — 획득점수·집계는 코드가 규칙값으로 재계산 |
| `override_reason` | TEXT NULL | 수정 사유 |

### `app_config` — 설정 (담당자 조정 가능 파라미터)

| config_key | 기본값 | 용도 |
|---|---|---|
| `low_score_cut` | 70 | 상태라벨 '저점수' 기준 (총점 < 값) |
| `item_rate_warn` | 60 | ★v3 — 화면④ 달성률 '개선 필요' 컷 |
| `item_rate_ok` | 80 | ★v3 — 화면④ 달성률 '양호' 컷 |

---

## 3. 버전 변경 요약 (누적 보존)

### v4 → v5 (2026-07-10 — 검수(리뷰) 쓰기 계약 v1)

1. **3-F `evaluation_reviews` + 3-G `evaluation_review_overrides` 신설** —
   사람 검수(확정·코멘트·항목 충족수준 수정)를 AI 테이블 불변인 별도 레이어로 저장.
   유효 집계는 저장 시점 물질화, 화면은 COALESCE(유효값, AI 원본) (계약 결정 1·2)
2. `ai_evaluation_verify_log.stage` ENUM에 `'검수폐기'` 추가 — 재채점·철회로
   삭제되는 검수의 전문을 `candidate_json`에 보존 (v4 '정본교체'와 동일 패턴·동일 마이그레이션 방식)
3. (스키마 외 규약) 확정 검수 건은 배치 재채점 기본 스킵 — 채점 시작 전 사전 조회,
   `onConfirmedReview='force'` 명시 시에만 덮어쓰기 (계약 결정 3)

### v3 → v4 (2026-07-06 — 재채점 덮어쓰기 정책)

1. **재채점 = 덮어쓰기** — 상담당 (consultation_id, evaluator) 정본 1건 유지.
   `evaluationRepo.saveFinalEvaluation()`이 기존 정본을 3-E에 보존 후 삭제 → 새로 저장 (한 트랜잭션)
2. `ai_evaluation_verify_log.stage` ENUM에 `'정본교체'` 추가 — 폐기 정본의 원본 전문을
   `candidate_json`에 보존 (기존 DB는 schema.sql 하단 마이그레이션 블록이 조건부 ALTER)
3. `attempt_no` 이어 세기 규약 명문화 — 재채점 시 1부터 재시작 금지, `verifyLogRepo.getNextAttemptNo()` 사용
4. (스키마 외) `evaluation_id`는 재채점마다 재발급 — 외부 참조 키 사용 금지 (화면①·② API 계약에 명시)

### v2 → v3 (2026-07-05)

1. `agents` 테이블 신설 + 명부 시드 (화면③·④용)
2. `consultation_master.agent_id` FK 전환 — 기존 DB는 schema.sql 재실행 시 자동 이행(백필 포함), 엔진 코드는 `persist.ts`의 `ensureAgent()` 보강으로 무영향
3. 복합 인덱스 `(agent_id, consulted_at)` 추가
4. `app_config`에 화면④ 임계값 2키 추가

## 4. 엔진·RAG 쪽에서 지킬 불변식 (요약)

- **집계 3컬럼·상태라벨은 LLM 값 그대로 저장 금지** — 앱 코드 재계산 (`lib/scoring/scoring.ts`)
- N/A는 행 삭제가 아니라 `level='해당없음'` — 집계 시 분자·분모 제외
- `quote`는 transcript 원문과 문자열 일치해야 함 (안전망② — 불일치는 재판정 대상)
- 컷값·모델명·임계값 하드코딩 금지 (`app_config` / `.env`)
- Chroma 인덱싱 대상은 `docs/rag/`만 — `docs/hard/` 절대 금지
- ★v5: **검수가 3-A/3-B/3-D를 UPDATE하는 경로 금지** — 사람 수정은 3-F·3-G 레이어에만
- ★v5: 3-F 유효 집계는 `computeAggregates` 재사용 (별도 산식 금지) / 3-G에 점수 컬럼 금지
- ★v5: 3-F가 지워지는 모든 경로(force 재채점·검수중 건 재채점·철회)는
  삭제 직전 3-E `'검수폐기'` 보존 필수 / compare-golden 등 검증 경로는 3-F·3-G 참조 금지
