# 검수(리뷰) 쓰기 — API 계약 v1

> **목적:** 화면② 하단의 검수확정·점수수정·코멘트 버튼(쓰기 3종)을 위한
> **데이터 약속 문서**다. 화면② 계약 §6에서 "쓰기 계약은 별도 문서로"
> 미뤄둔 그 문서이며, 화면①~④ 계약과 같은 원칙·표기를 따른다.
>
> **v1 확정 (2026-07-10):** v0 초안의 설계 결정 3건이 전부 **기본안 A로 팀 합의**되었다.
> 각 결정의 선택지 표(대안·트레이드오프)는 결정 근거 보존을 위해 남긴다
> (이력 누적 보존 — CLAUDE.md §12). 결정 2의 기업담당자 컨펌 여부만 미정으로
> 남아 있다 (§1 결정 2 결정란·§6 남은 일 참조).
>
> ※ 용어 주의: 본문의 "쓰기 v0 / 쓰기 v1"은 **기능 개방 단계**이고,
> 이 문서의 버전(v1)과는 별개다.

---

## 0. 쉬운 설명 (개발 배경을 모르는 팀원용)

- 지금까지의 API는 전부 **읽기**였다. AI가 채점한 결과를 화면이 보여주기만 했다.
- 이 문서는 **사람(QA 담당자)이 개입하는 순간**을 다룬다: AI 판정을 확인하고
  도장을 찍거나(검수확정), AI가 틀린 항목을 바로잡거나(수정), 메모를 남긴다(코멘트).
- 핵심 설계 사상 두 가지:
  1. **AI 원본은 절대 건드리지 않는다.** 사람 수정은 별도 테이블에 "덧씌우는
     레이어"로 쌓인다. 이유: 골든셋 80% 일치율 검증은 "AI가 실제로 낸 답"을
     대상으로 해야 의미가 있다. 사람 수정이 AI 값 위에 덮어써지면
     compare-golden이 재는 게 AI 정확도인지 사람 손질 결과인지 구분이 안 된다
     (CLAUDE.md §14 "골든셋을 AI 결과에 맞춰 수정 금지"와 같은 부류의 자기충족 오염).
  2. **사람도 점수를 직접 입력하지 않는다.** 검수자가 고치는 것은 항목의
     **충족수준(4택)**이고, 점수·총점·라벨은 AI 채점 때와 똑같은 코드
     (`computeAggregates`)가 재계산한다 ("판단은 사람/AI가, 계산은 코드가" —
     CLAUDE.md §5.2를 검수자에게도 동일 적용).

---

## 1. 설계 결정 3건 (★확정 — 선택지 표는 근거 보존용)

### 결정 1 — 수정본 저장 위치

| 안 | 내용 | 장점 | 단점 |
|---|---|---|---|
| **A. 별도 테이블 2개 (채택)** | `evaluation_reviews`(검수 헤더, 3-F) + `evaluation_review_overrides`(항목별 충족수준 수정, 3-G). AI 테이블(3-A~3-E)은 불변 | AI 레이어/사람 레이어 분리로 감사 추적 명확. 항목 수정은 본질적으로 1:N이라 자연스러움. 검수 자체 생명주기(작성→확정→무효화) 표현 가능 | 화면 쿼리에 JOIN 1~2개 추가 |
| B. 3-A에 검수 컬럼 추가 | `ai_evaluation_master`에 review_status 등 추가 | JOIN 없음 | 28컬럼 테이블에 성격이 다른 레이어가 섞임. 항목별 수정(1:N)은 어차피 못 담음 → 결국 반쪽 |
| C. 수정 시 재저장(덮어쓰기) | 사람 수정을 3-A/3-B에 UPDATE | 구현 최소 | **AI 원본 소실 → compare-golden 오염. 채택 불가** |

**부속 확정 (A안 채택으로 자동 포함):** 수정의 원자 단위 = **충족수준(충족/부분충족/미충족/해당없음)**.
검수자가 임의 점수(예: 3.7)를 입력하는 UI·API는 만들지 않는다. 획득점수·적용배점합·
환산총점·상태라벨·위험표시여부는 저장 시점에 `computeAggregates`가 재계산한다
(부분충족=½·N/A 분모 제외 규칙이 사람 수정에도 동일하게 걸리고, 계산 코드를 재사용).

> ☑ 결정: **A안 (별도 테이블 2개 + 수정 단위=충족수준)** / 결정일: 2026-07-10 / 결정자: 팀 합의

### 결정 2 — 화면 집계 기준 (AI 원본 vs 검수 반영 "유효값")

| 안 | 내용 | 장점 | 단점 |
|---|---|---|---|
| **A. 이원화 (채택)** | **화면①③④ = 유효값**(검수 반영 후) / **검증 경로(compare-golden·verify_log) = AI 원본만** | 담당자가 오탐을 바로잡으면 화면에 즉시 반영 → 도구 신뢰 유지. 화면④ 코칭 근거가 "확정된 판정" 기반이 됨. 정확도 검증은 오염 없이 유지 | 화면④ 항목 단위 집계까지 3-G JOIN 필요 (①만 유효값 쓰고 ④가 원본 쓰면 ③↔④ 정합 표가 레이어 불일치로 깨짐 — 전부 가거나 전부 안 가거나) |
| B. 화면도 AI 원본 고정 | 검수는 기록만, 집계 불변 | 구현 최소 | 검수로 바로잡아도 빨간불·틀린 약점이 계속 표시 → 검수 행위가 화면상 무의미 |
| C. 조회 시 실시간 재계산 | 물질화 없이 매 조회마다 override 반영 계산 | 저장 로직 단순 | 집계 쿼리가 이미 ①③④ 세 군데 — 재계산 로직이 흩어지면 statusLabels에서 막았던 종류의 ①↔③↔④ 불일치 위험 재발 |

**A안의 구현 방식 (확정):** 검수 저장 시점에 코드가 유효 집계(환산총점·상태라벨·
위험표시여부)를 3-F에 **물질화**하고, 화면 쿼리는
`COALESCE(r.final_score_effective, m.final_score)` 패턴으로 읽는다
(단일 저장·다중 읽기 — 재계산 로직 분산 방지).

**단계 개방 (MVP 절충 — 확정에 포함):**
- **쓰기 v0 = 검수확정 + 코멘트만.** 이 둘은 집계에 영향이 없어 화면 쿼리
  수정(COALESCE·3-G JOIN)이 전혀 필요 없다 → verify-consistency 무수정 통과.
- **쓰기 v1 = 충족수준 수정(override) 개방.** 이때 화면①③④ 쿼리에 유효값
  레이어를 일괄 적용하고 verify-consistency에 "유효값 정합" 검사를 추가한다.
- 스키마(3-F·3-G)는 **v0부터 최종형으로 생성**한다 — 기능만 단계 개방,
  마이그레이션 재작업 방지.

> ☑ 결정: **A안 (이원화 + 단계 개방)** / 결정일: 2026-07-10 / 결정자: 팀 합의
> ☐ 기업담당자 컨펌 필요 여부: **미정** — 대시보드 수치가 "검수 반영 후" 값이 되는
>   업무 정책이므로 5단계(기업담당자 컨펌) 때 안건으로 상정 (§6 남은 일)

### 결정 3 — 재채점 덮어쓰기와 검수의 충돌

배경: 재채점=덮어쓰기(팀 결정 2026-07-06)로 `saveFinalEvaluation`이 기존 정본을
3-E에 '정본교체'로 보존 후 DELETE한다. 검수(3-F)가 evaluation_id에 FK CASCADE로
걸리면 재채점 시 검수도 함께 지워진다. RAG 교체·프롬프트 보강 때마다 score-all
전건 재채점이 반복되는 운영 현실과 사람이 확정한 판정의 보존을 어떻게 조화시킬 것인가.

| 안 | 내용 | 장점 | 단점 |
|---|---|---|---|
| **A. 기본 스킵 + 명시적 강제 (채택)** | `saveFinalEvaluation`에 `onConfirmedReview: 'skip'(기본) \| 'force'` 옵션. 확정 검수 존재 건은 기본 건너뛰고 배치 리포트에 "확정 검수로 스킵 N건" 표기. force 시 검수 내용을 3-E에 보존 후 삭제 | 배치는 기본값으로 안전(score-all 무사고). 의도적 재채점만 force 명시. "지우기 전에 로그 보존"은 이 레포의 기존 관례('정본교체')라 학습 비용 0 | 옵션 분기 1개 추가 |
| B. 하드락 (확정 건 재채점 금지) | 확정 검수 존재 시 에러 | 검수 절대 보존 | 전건 배치가 확정 1건에 막힘 → 락 우회 습관 유발 |
| C. 무조건 무효화 | 재채점이 검수를 항상 삭제 | 구현 최소 | 사람이 책임지고 확정한 판정을 기계가 묻지도 않고 폐기 → 검수 행위 무의미화 |

**A안의 부속 확정:**
- 3-E `stage` ENUM에 **'검수폐기'** 추가 (v4의 '정본교체' 추가와 동일한
  재실행 안전 마이그레이션 패턴 — schema.sql 461행 참조).
- **보존 규약 (통일):** 재채점이 3-F 행을 삭제하게 되는 **모든 경우** —
  확정 검수 + force, **검수중(미확정) 검수 + 일반 재채점 포함** — 삭제 전에
  3-E `stage='검수폐기'` 행으로 보존한다. `candidate_json`에 검수 전문
  (검수자·검수상태·override 목록·코멘트·유효 집계)을 JSON으로 보존.
  **보존 없는 검수 삭제 경로를 만들지 않는다.**
- 3-F는 `evaluation_id` FK **ON DELETE CASCADE** — 삭제 자체는 자동,
  보존만 삭제 전에 명시적으로 수행 (기존 '정본교체' 코드 경로와 동일한 순서).
- **스킵 판정 위치:** 확정 검수 존재 여부는 **채점 시작 전**(score-all 등
  배치 진입부)에 조회해 해당 건을 건너뛴다 — 채점을 다 돌린 뒤 저장 단계에서
  스킵하면 확정 건마다 LLM 호출 비용이 낭비된다. `saveFinalEvaluation`의
  skip 기본값은 **최후 방어선**으로 별도 유지 (단건 재채점 API 등 배치 외
  진입 경로 대비 — 이중 안전망).

> ☑ 결정: **A안 (기본 스킵 + 명시적 force)** / 결정일: 2026-07-10 / 결정자: 팀 합의

---

## 2. 스키마 (AXDB_v5 — 확정 결정 기준)

> 명명·타입은 기존 관례를 따름: 한글 ENUM 유지(스키마 머리말 53행 —
> 문자셋 무관 보존 원칙), snake_case, 백틱 식별자, 재실행 안전 마이그레이션.

```sql
-- 3-F. 검수 헤더 — 평가 1건당 검수 최대 1건 (재검수는 갱신)
CREATE TABLE IF NOT EXISTS `evaluation_reviews` (
  `review_id`       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `evaluation_id`   INT UNSIGNED NOT NULL
      COMMENT '대상 평가 (3-A). 재채점 시 CASCADE 삭제 — 삭제 전 3-E 보존은 코드 책임(결정 3)',
  `review_status`   ENUM('검수중','확정') NOT NULL DEFAULT '검수중'
      COMMENT '확정 = 재채점 기본 스킵 대상(결정 3-A)',
  `reviewer`        VARCHAR(64) NOT NULL
      COMMENT 'MVP: 자유 문자열(로그인 없음). 인증 도입 시 FK 전환',
  `review_comment`  TEXT NULL DEFAULT NULL,
  -- 유효 집계 물질화 (결정 2-A). override 없으면 AI 값과 동일 복사.
  -- 쓰기 v0(확정+코멘트만) 단계에서는 항상 AI 값 복사 = 화면 쿼리 무수정.
  `final_score_effective`  DECIMAL(4,1) NOT NULL,
  `status_label_effective` ENUM('정상','불완전판매 의심','저점수') NOT NULL,
  `risk_flagged_effective` TINYINT(1) NOT NULL,
  `reviewed_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    ON UPDATE CURRENT_TIMESTAMP
      COMMENT '마지막 검수 수정 시각. 확정 시각과 미구분 — MVP 수용, 필요 시 confirmed_at 분리',
  PRIMARY KEY (`review_id`),
  UNIQUE INDEX `uq_review_evaluation` (`evaluation_id`),
  CONSTRAINT `fk_review_evaluation`
    FOREIGN KEY (`evaluation_id`) REFERENCES `ai_evaluation_master` (`evaluation_id`)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- 3-G. 항목별 충족수준 수정 — 쓰기 v1에서 개방 (스키마는 v0부터 생성)
CREATE TABLE IF NOT EXISTS `evaluation_review_overrides` (
  `override_id`   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `review_id`     INT UNSIGNED NOT NULL,
  `item_code`     ENUM('A1','A2','A3','B1','B2','B3','B4',
                       'C1','C2','C3','D1','D2','D3','D4','D5','D6',
                       'E1','E2') NOT NULL,
  `level_original` ENUM('충족','부분충족','미충족','해당없음') NOT NULL
      COMMENT '수정 시점의 AI 판정 스냅샷 (감사 추적 — 3-B 재조회 없이 diff 표시)',
  `level_override` ENUM('충족','부분충족','미충족','해당없음') NOT NULL
      COMMENT '검수자 판정. 점수 직접 입력 없음 — 획득점수는 코드가 규칙값으로 재계산(결정 1 부속)',
  `override_reason` TEXT NULL DEFAULT NULL,
  PRIMARY KEY (`override_id`),
  UNIQUE INDEX `uq_override_item` (`review_id`, `item_code`),
  CONSTRAINT `fk_override_review`
    FOREIGN KEY (`review_id`) REFERENCES `evaluation_reviews` (`review_id`)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- v5 마이그레이션 — verify_log stage ENUM에 '검수폐기' 추가
-- (v4 '정본교체' 추가와 동일한 재실행 안전 패턴 — INFORMATION_SCHEMA 검사 후 MODIFY)
```

> **열지 않는 문 (Do NOT):**
> - 3-A/3-B/3-D의 UPDATE 경로를 만들지 않는다 (AI 원본 불변).
> - 3-G에 점수 컬럼을 두지 않는다 (충족수준만 — 점수는 파생값).
> - 유효 집계 계산에 `computeAggregates` 외 별도 산식을 만들지 않는다.
> - 보존(3-E '검수폐기') 없이 3-F를 삭제하는 코드 경로를 만들지 않는다 (결정 3 부속).

---

## 3. 엔드포인트 (쓰기 v0 범위 + v1 예고)

### 3.1 `PUT /api/evaluations/{evaluation_id}/review` — 검수 저장 (v0)

멱등 업서트: 검수가 없으면 생성, 있으면 갱신 (UNIQUE `evaluation_id`).

**상태 전이 규약:** 업서트는 `확정 → 검수중` 되돌림(**확정 해제**)도 허용한다.
확정 해제 = 상태만 되돌림 (코멘트·override 내용 보존, 재채점 스킵 보호만 해제).
철회(§3.2 DELETE) = 검수 자체 삭제. 역할이 다르므로 프론트는 두 동작을 구분해 노출한다.

**요청 본문 (v0):**

```json
{
  "review_status": "확정",
  "reviewer": "김QA",
  "review_comment": "D2 근거 발화 확인 완료. 판정 타당."
}
```

**요청 본문 (v1 — overrides 개방 시 확장):**

```json
{
  "review_status": "확정",
  "reviewer": "김QA",
  "review_comment": "B1은 정정 발화까지 감안하면 충족이 맞음.",
  "overrides": [
    { "item_code": "B1", "level_override": "충족", "override_reason": "U9에서 즉시 정정 — 오정보 지속 아님" }
  ]
}
```

**서버 처리 순서 (v1 기준 — v0는 ③이 "AI 값 복사"로 단순화):**
① 대상 평가 존재 확인(404) → ② overrides 검증(항목코드·4택 ENUM, 400) →
③ 3-B의 18항목에 override를 얹은 "유효 항목평가"로 `computeAggregates` 재계산
(컷은 **저장 시점** `app_config` — 하드코딩 금지. 저장 시점 컷으로 라벨이 물질화되는
것은 3-A의 기존 동작(채점 시점 컷으로 저장)과 동일한 의미론) →
④ 3-F 업서트 + 3-G 교체(전삭제 후 재삽입 — 요청 본문이 전체 상태) — 한 트랜잭션.

**응답 `200`:**

```json
{
  "review": {
    "review_id": 12,
    "evaluation_id": 107,
    "review_status": "확정",
    "reviewer": "김QA",
    "review_comment": "…",
    "overrides": [],
    "effective": {
      "final_score": 65.9,
      "status_label": "저점수",
      "risk_flagged": false,
      "status_labels": ["저점수"]
    },
    "reviewed_at": "2026-07-10T14:00:00+09:00"
  }
}
```

- `effective.status_labels`는 공용 헬퍼(`computeStatusLabels`)로 계산 —
  화면①② 병기 규칙과 단일 구현 (①계약 §3.3 정본).
- 잘못된 본문: `400` / 평가 없음: `404` / 서버 오류: `500` (+`{"error": …}`).

### 3.2 `DELETE /api/evaluations/{evaluation_id}/review` — 검수 철회 (v0)

검수를 삭제하고 화면 집계를 AI 원본으로 되돌린다. 없으면 `404`.
철회 전 내용을 3-E에 `stage='검수폐기'`·`checker='코드'`로 보존(결정 3 보존 규약 공유 —
철회도 "3-F 행이 지워지는 경우"이므로 예외 없음).

- 성공: `200` + `{ "deleted": true }` (★구현 시 확정 2026-07-11)
- 잘못된 ID: `400` / 검수 없음: `404` / 서버 오류: `500` (+`{"error": …}`)

### 3.3 읽기 반영 (화면② 계약 v1.1로의 파급 — 별도 개정 필요)

`GET /api/evaluations/{id}` 응답에 `review` 블록(3.1 응답과 동일 형태, 검수
없으면 `null`)을 추가한다. **이 계약이 확정되었으므로 화면② 계약을 v1.1로 개정**해
블록 추가를 명시할 것 (계약 문서 버전 정합 — CLAUDE.md §12).

---

## 4. 계산 규칙 (수식 정본 — 확정 결정 기준)

```
유효 획득점수(항목) = expectedScore(override 있으면 level_override, 없으면 AI level)
                     ← AI 채점과 동일 규칙표: 충족=배점 / 부분충족=배점÷2 / 미충족·해당없음=0
유효 집계          = computeAggregates(유효 항목평가, AI 위험플래그, 저장 시점 low_score_cut)
                     ← 별도 산식 금지 — AI 채점 저장(saveFinalEvaluation)과 같은 함수
화면 표시값        = COALESCE(유효값, AI 원본)   ← 검수 없으면 AI 값 (화면①②③④ 공통 — 결정 2-A)
검증 경로          = 항상 AI 원본 (3-A/3-B 직접 — 3-F/3-G 참조 금지)
```

**미결 세부 1건 (쓰기 v1 개방 시 확정):** 충족수준 수정이 위험플래그 자체를
소거·추가하는가? 현재 입장은 **플래그는 AI 판정 보존, 라벨·총점만 유효값 재계산**
(플래그는 "AI가 이런 위험 신호를 봤다"는 기록이고, 사람이 오탐이라 판단하면
그 결과는 라벨·점수에 반영됨). 단 규칙 5(D영역<50%)는 총점 파생이라 재계산이
자연스러워 경계가 애매함 — 쓰기 v1 착수 시 결정.

> ☐ 미결 세부 결정: ______ / 결정일: ______

---

## 5. 엣지 케이스

| 상황 | 응답 / 동작 |
|---|---|
| 검수 없는 평가 조회 | `review: null` — 화면 표시값은 AI 원본 그대로 |
| override로 총점이 컷을 넘음 | `status_label_effective` 재계산으로 '저점수' 해제 — 화면① 병기·정렬에 즉시 반영 (쓰기 v1) |
| override 전부 AI와 동일값 | 저장은 허용하되 3-G에 기록 (검수자가 "검토했음"을 남긴 것) — diff 표시는 프론트 몫 |
| 확정 검수 존재 건 재채점 (배치) | **채점 시작 전 사전 조회**로 skip (LLM 미호출) + 리포트에 "확정 검수로 스킵 N건" 표기 (결정 3-A). 저장 단계 skip은 최후 방어선 |
| 확정 검수 존재 건 재채점 (force) | 3-E '검수폐기' 보존 → CASCADE 삭제 → 새 평가 INSERT — 한 트랜잭션 |
| 검수중(미확정) 건 재채점 | skip 대상 아님 (확정만 보호). 단 **보존 규약은 동일** — 3-E '검수폐기' 보존 후 삭제 |
| 확정 해제 (`확정 → 검수중` PUT) | 허용 (§3.1 상태 전이) — 내용 보존, 재채점 스킵 보호만 해제 |
| 재채점 후 새 평가에 이전 검수 자동 승계? | **하지 않는다** — 새 AI 판정에 대한 검수는 새로 수행 (이전 내용은 3-E에서 참조 가능) |

---

## 6. 남은 일 (이 계약과 연결된 후속 작업)

- [x] §1 결정 3건 팀 합의 → v1 확정 (2026-07-10)
- [ ] 결정 2(대시보드 수치 = 검수 반영 유효값)의 기업담당자 컨펌 여부 판단 — 5단계 컨펌 때 안건 상정
- [x] AXDB_v5: 3-F·3-G 생성 + stage ENUM '검수폐기' 마이그레이션 (`scripts/schema.sql` 갱신 + 스냅샷 `lib/db/AXDB_v5.sql`) (2026-07-10)
- [x] `lib/db/reviewRepo.ts` 신설 (업서트·철회·유효 집계 물질화 + 3-E '검수폐기' 보존 헬퍼 `preserveReviewOnConn` + 배치 스킵 판정 `hasConfirmedReview`) (2026-07-11)
- [x] 라우트 2종 — `app/api/evaluations/[id]/review/route.ts` (PUT·DELETE) (2026-07-11)
- [ ] `saveFinalEvaluation`에 `onConfirmedReview` 옵션 (결정 3-A) + score-all **채점 전 사전 조회 스킵** + 리포트에 스킵 카운트
      — SE 파이프라인 코드와 접점. `reviewRepo.preserveReviewOnConn`(트랜잭션 내 보존)·`hasConfirmedReview`(사전 스킵) 사용
- [x] 화면② 계약 v1.1 개정 (`review` 블록 §3.4 추가) + 스텁 갱신 (`evaluation-detail.v1.example.json`에 `review: null`, 검수 존재 케이스는 `review.v1.example.json` 신설) (2026-07-11)
- [ ] (쓰기 v1 개방 시) 화면①③④ 쿼리 COALESCE 유효값 레이어 + verify-consistency에 유효값 정합 검사 추가 + §4 미결 세부(플래그 소거 여부) 확정
      + 화면① 계약 v1.1 개정 안건: `status` 필터·정렬의 기준(저장 라벨 vs 유효 라벨) 정의

## 7. 변경 이력

| 버전 | 일자 | 내용 |
|---|---|---|
| v0 초안 | 2026-07-10 | 최초 작성 — 설계 결정 3건 선택지 표(기본안: 별도 테이블+충족수준 단위 수정 / 화면=유효값·검증=원본 이원화+단계 개방 / 재채점 기본 스킵+force), AXDB_v5 스키마 제안, 엔드포인트 2종, 미결 세부 1건(플래그 소거) 명시 |
| v1 | 2026-07-10 | 결정 3건 전부 기본안 A로 팀 합의 확정 (결정 2 기업담당자 컨펌 여부만 미정 잔존). 보완 반영: ① 배치 스킵 판정을 채점 시작 전 사전 조회로 명시 (LLM 비용 낭비 방지, 저장 단계 skip은 최후 방어선) ② 검수 보존 규약 통일 — 3-F 삭제의 모든 경로(force·검수중 재채점·철회)에서 3-E '검수폐기' 선보존 ③ 확정 해제(확정→검수중) 전이 허용 명시 + 철회와 역할 구분 ④ 오기 수정: 컷 로드 "조회 시점"→"저장 시점" (+ 3-A와 동일 의미론 주석) ⑤ reviewed_at 확정/수정 시각 미구분 한계 주석 |
| v1 (구현 반영) | 2026-07-11 | §3.2 DELETE 성공 응답 본문 명세 추가(`200 {"deleted": true}` — 라우트 구현 시 확정). §6 남은 일 진척 갱신 (스키마 v5·reviewRepo·라우트 2종·화면② 계약 v1.1 완료) |
