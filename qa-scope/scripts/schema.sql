-- =====================================================================
-- 한빛생명(가상) 콜센터 QA 자동채점 시스템 — DB 스키마 v1.0
-- 기준 문서: 콜센터_DB_스키마.md / 상담평가_출력스키마_ver2.json
--            보험상담_평가루브릭_v1.5 / N_A_매핑규칙_확정본
--            검수_쓰기_API계약_v1.md (★v5 — 3-F·3-G)
-- 대상 DBMS: MySQL 8.0+
--
-- 구조:
--   0.   agents                     상담사 마스터 (★v3 신설 — 화면③·④ 상담사 단위 화면용)
--   1.   consultation_master        상담 마스터 (★v3: agent_id → agents FK 전환)
--   2.   consultation_dialogues     상세 대화 내역
--   3-A. ai_evaluation_master       평가 결과 헤더 (분류·판매정보·집계·고객만족·요약·피드백)
--   3-B. ai_evaluation_details      항목별 평가 (18항목 × 평가건)
--   3-C. ai_evaluation_risk_flags   위험 플래그 (규칙 1~6)
--   3-D. ai_evaluation_evidences    항목별 근거 인용 (★ "점수 클릭→텍스트 점프"용)
--   3-E. ai_evaluation_verify_log   채점 파이프라인 검증 로그
--                                   (①형식검증 → ②인용 원문대조(코드) → ③내용 교차검증(2차 LLM))
--   3-F. evaluation_reviews         검수 헤더 (★v5 신설 — 사람 검수: 확정·코멘트·유효 집계)
--   3-G. evaluation_review_overrides 항목별 충족수준 수정 (★v5 신설 — AI 원본 불변 레이어)
--   4.   users                      로그인 계정 (★v6 신설 — NextAuth Credentials 대조 대상)
--   5.   coaching_tips              코칭 팁 (★v7 신설 — 항목코드별 정적 문구, 관리자 편집 대상)
--   6.   policy_documents           관리자 업로드 약관 문서 (★v8 신설 — RAG 재색인 이력)
--
-- 파이프라인 전제:
--   * 최종 평가는 상담당 AI 1건만 저장 (검증 통과본). 중간 시도·모니터링 AI의
--     소견은 3-A에 행을 만들지 않고 3-E 로그에만 남긴다.
--   * 사람 골든셋 채점을 DB에 넣을 경우를 대비해 evaluator 축은 유지
--     → UNIQUE(consultation_id, evaluator)로 "주체별 1건" 보장.
--
-- 주요 설계 결정 (스켈레톤 대비 변경점):
--   * 스키마명 qa-scope → qa_scope : 하이픈은 매번 백틱 필요, 언더스코어 권장
--   * 테이블명에서 "1. " 같은 접두어 제거 : 공백·마침표 포함 식별자는
--     ORM·쿼리 작성 시 지속적인 골칫거리가 됨 (순서는 주석으로 표기)
--   * utf8 → utf8mb4 : MySQL의 utf8은 3바이트 축약형이라 이모지·일부 한자 깨짐
--   * PK는 AUTO_INCREMENT 대리키 + 대외 표기용 코드(C-2026-018442 등)는
--     별도 UNIQUE 컬럼으로 분리
--
-- v3 변경 (2026-07-05 — 화면④ API 계약 v1 후속):
--   * agents 테이블 신설 + consultation_master.agent_id FK 전환.
--     agents만은 대리키 없이 agent_id(VARCHAR) 자연키 PK를 쓴다 — 이미 전체
--     코드·데이터가 'AGT-001' 문자 ID로 참조 중이라 FK 전환이 ALTER 한 번으로
--     끝나고, 상담사 ID 체계 자체가 불변 코드라 대리키 이득이 없음.
--   * 'unknown' 상담사(미배정) 행을 명부에 포함 — persist.ts가 상담사 미상
--     transcript를 agent_id='unknown'으로 적재하는 경로 보호.
--   * 이 파일은 재실행(npm run db:schema)에 안전해야 한다 — 기존 DB 이행은
--     맨 아래 "v3 마이그레이션" 블록이 백필 + 조건부 ALTER로 처리.
--
-- v4 변경 (2026-07-06 — 재채점 덮어쓰기 정책):
--   * 상담당 평가 정본은 (consultation_id, evaluator)당 1건 유지 — 재채점 시
--     evaluationRepo.saveFinalEvaluation()이 기존 정본을 삭제 후 새로 저장(덮어쓰기).
--   * 폐기되는 정본의 원본 전문(ai_output_json)은 삭제 직전 3-E에
--     stage='정본교체' 행으로 보존 → stage ENUM에 '정본교체' 추가.
--   * attempt_no는 상담 기준으로 이어 센다 (재채점 시 1부터 재시작 금지 —
--     UNIQUE(consultation_id, attempt_no, stage) 충돌 방지.
--     파이프라인은 verifyLogRepo.getNextAttemptNo()로 다음 회차를 받는다).
--
-- v5 변경 (2026-07-10 — 검수(리뷰) 쓰기 계약 v1):
--   * 3-F evaluation_reviews + 3-G evaluation_review_overrides 신설 —
--     사람 검수(확정·코멘트·항목 충족수준 수정)를 AI 테이블(3-A~3-D) **불변**인
--     별도 레이어로 저장 (compare-golden 등 검증 경로는 AI 원본만 읽는다).
--     유효 집계(환산총점·상태라벨·위험표시)는 저장 시점에 computeAggregates로
--     재계산해 3-F에 물질화, 화면 ①~④는 COALESCE(유효값, AI 원본)로 읽는다
--     (검수_쓰기_API계약_v1.md 결정 1·2 — 쓰기 v0에서는 AI 값 복사라 화면 무영향).
--   * 재채점 충돌 (계약 결정 3): 확정 검수 존재 건은 배치 재채점에서 기본 스킵,
--     onConfirmedReview='force' 명시 시에만 덮어쓰기. 3-F 행이 지워지는 모든
--     경로(force·검수중 건 재채점·검수 철회)는 삭제 직전 3-E에
--     stage='검수폐기' 행으로 검수 전문을 보존 → stage ENUM에 '검수폐기' 추가.
--
-- v6 변경 (2026-07-16 — 로그인/인증 도입):
--   * users 테이블 신설 — NextAuth(Auth.js) Credentials 방식의 계정 대조 대상.
--     회원가입 없음(관리자 발급), 데모는 시드 1건 qa_manager.
--     신설 테이블이라 CREATE TABLE IF NOT EXISTS 자체가 마이그레이션(별도 ALTER 블록 불요).
--   * ⚠ 비밀번호는 schema.sql에서 시드하지 않는다 — bcrypt 해시를 env에서 공급
--     (scripts/seed-user.ts). 평문 하드코딩 금지 (설계문서 §3·§13).
--   * 정본 계약: docs/db/로그인 설계문서 v1 20260716.md.
--
-- v7 변경 (2026-07-18 — 코칭 팁 관리자 편집 기능):
--   * coaching_tips 테이블 신설 — 기존 lib/db/agentReportRepo.ts의
--     COACHING_TIPS 상수(18항목 하드코딩)를 관리자 화면에서 편집 가능하게
--     테이블로 이전. 이 스키마 단계에서는 테이블·시드만, 조회 코드 교체는 다음 단계.
--   * 신설 테이블이라 CREATE TABLE IF NOT EXISTS 자체가 마이그레이션
--     (4. users·v6과 동일 규약 — 별도 ALTER 블록 불요).
--
-- v8 변경 (2026-07-18 — 관리자 약관 업로드/RAG 재색인):
--   * policy_documents 테이블 신설 — 관리자가 업로드한 약관 원문·색인 이력 보관.
--     활성 컬렉션명은 app_config.rag_collection_name(시드: 'policy_v2')이 정본.
--   * 신설 테이블이라 CREATE TABLE IF NOT EXISTS 자체가 마이그레이션
--     (4. users·5. coaching_tips와 동일 규약 — 별도 ALTER 블록 불요).
-- =====================================================================

-- 클라이언트 문자셋 고정 — docker-entrypoint-initdb.d 등 실행 환경의 로케일과
-- 무관하게 한글 ENUM('상담사','고객' 등)이 깨지지 않도록 반드시 유지.
SET NAMES utf8mb4;

SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;
SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='TRADITIONAL,ALLOW_INVALID_DATES';

-- ---------------------------------------------------------------------
-- Schema qa_scope
-- ---------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS `qa_scope`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `qa_scope`;

-- ---------------------------------------------------------------------
-- 0. 상담사 마스터 (★v3 신설)
--    화면③(대시보드)·④(개인 리포트)의 상담사명·팀 순위 공급원.
--    유일하게 자연키 PK — consultation_master.agent_id(VARCHAR)와 동일 체계라
--    FK 전환에 데이터 이행이 필요 없음 (헤더 v3 변경 참조).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `agents` (
  `agent_id`   VARCHAR(20) NOT NULL
      COMMENT '상담사 ID (예: AGT-001). 특수값 unknown = 미배정',
  `agent_name` VARCHAR(50) NOT NULL
      COMMENT '상담사 표시 이름 — 화면③ 표·화면④ 헤더용',
  `team_name`  VARCHAR(50) NULL DEFAULT NULL
      COMMENT '(예비) 소속 팀. 현재 집계는 전체 명부 기준이라 미사용',
  `is_active`  TINYINT(1)  NOT NULL DEFAULT 1
      COMMENT '재직 여부 — 퇴사자는 행 삭제 대신 0 (과거 평가 이력 보존)',
  `created_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`agent_id`)
) ENGINE = InnoDB
  COMMENT = '0. 상담사 마스터 — 상담사명·재직 상태 (화면③·④용)';

-- 더미 명부 시드 — 이름은 더미 transcript에서 상담사가 스스로 밝힌 이름
-- (seed.ts의 배정 규칙과 동일). 재실행 시 기존 행은 건드리지 않는다(app_config와 동일 규약).
INSERT INTO `agents` (`agent_id`, `agent_name`, `is_active`) VALUES
  ('AGT-001', '이지현', 1),
  ('AGT-002', '이준호', 1),
  ('AGT-003', '박소영', 1),
  ('AGT-004', '정유나', 1),
  ('AGT-005', '한지원', 1),
  ('AGT-006', '김도연', 1),
  ('unknown', '미배정', 0)
ON DUPLICATE KEY UPDATE `agent_name` = `agent_name`;

-- ---------------------------------------------------------------------
-- 1. 상담 마스터 테이블
--    콜센터_DB_스키마.md: 상담ID / 상담사ID / 고객ID / 일시 / 상담유형
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `consultation_master` (
  `consultation_id`   INT UNSIGNED     NOT NULL AUTO_INCREMENT
      COMMENT '상담 PK (내부용 대리키)',
  `consultation_code` VARCHAR(30)      NOT NULL
      COMMENT '대외 표기용 상담 코드 (예: C-2026-018442)',
  `agent_id`          VARCHAR(20)      NOT NULL
      COMMENT '상담사 ID — FK → agents (v3에서 전환 완료)',
  `customer_id`       VARCHAR(20)      NOT NULL
      COMMENT '고객 ID — 개인정보는 저장하지 않고 식별자만. 실데이터 도입 시 가명화 필수',
  `consulted_at`      DATETIME         NOT NULL
      COMMENT '상담 시작 일시 (초 단위)',
  `consultation_type` ENUM('신규·보장','계약변경','해지·환급','보험금청구','단순문의')
                                       NULL DEFAULT NULL
      COMMENT '상담 유형. 입력 시점에 있으면 채움, 없으면 NULL(AI 분류 결과는 3-A에 별도 저장)',
  `created_at`        DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`consultation_id`),
  UNIQUE INDEX `uq_consultation_code` (`consultation_code`),
  INDEX `idx_master_agent` (`agent_id`),
  INDEX `idx_master_consulted_at` (`consulted_at`),
  -- ★v3: 화면④ "상담사 × 기간" 집계용 복합 인덱스
  INDEX `idx_master_agent_date` (`agent_id`, `consulted_at`),
  -- ★v3: 상담사 FK. RESTRICT — 상담이 달린 상담사는 삭제 불가(이력 보존, is_active=0으로 처리)
  CONSTRAINT `fk_master_agent`
    FOREIGN KEY (`agent_id`)
    REFERENCES `agents` (`agent_id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE = InnoDB
  COMMENT = '1. 상담 마스터 — 상담 건의 전체 분류';

-- ---------------------------------------------------------------------
-- 2. 상세 대화 내역 테이블
--    핵심: 통 텍스트가 아니라 [순서 × 화자 × 타임스탬프] 단위로 분리 저장
--    (AI 문맥 파악 + 관리자 녹음 재검토 시간 절약)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `consultation_dialogues` (
  `dialogue_id`     INT UNSIGNED  NOT NULL AUTO_INCREMENT
      COMMENT '발화 PK (내부용 대리키)',
  `dialogue_code`   VARCHAR(40)   NULL DEFAULT NULL
      COMMENT '대외 표기용 발화 코드 (예: C-2026-018442-002). 평가 JSON의 근거.대화ID와 매칭',
  `consultation_id` INT UNSIGNED  NOT NULL
      COMMENT 'FK → consultation_master',
  `turn_order`      INT UNSIGNED  NOT NULL
      COMMENT '한 상담 내 대화 순서 (1, 2, 3, …)',
  `speaker`         ENUM('상담사','고객') NOT NULL
      COMMENT '화자 구분 — STT 화자분리 결과',
  `spoken_at`       DATETIME      NOT NULL
      COMMENT '발화 시작 시각 (초 단위 필수 — 녹음 재검토용)',
  `offset_sec`      INT UNSIGNED  NULL DEFAULT NULL
      COMMENT '(선택) 상담 시작 기준 상대 오프셋 초. 더미의 [00:05] 표기 적재용',
  `content`         TEXT          NOT NULL
      COMMENT '발화 원문',
  PRIMARY KEY (`dialogue_id`),
  UNIQUE INDEX `uq_dialogue_code` (`dialogue_code`),
  UNIQUE INDEX `uq_consultation_turn` (`consultation_id`, `turn_order`),
  CONSTRAINT `fk_dialogues_consultation`
    FOREIGN KEY (`consultation_id`)
    REFERENCES `consultation_master` (`consultation_id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE = InnoDB
  COMMENT = '2. 상세 대화 내역 — 발화 단위 저장';

-- ---------------------------------------------------------------------
-- 3-A. 평가 결과 마스터 (헤더)
--    출력스키마 ver2의 [평가메타 / 분류 / 판매정보 / 집계 / 고객만족 /
--    요약 / 종합피드백]을 1행에 담는다.
--    ※ 집계 3컬럼(원점수합·적용배점합·환산총점)은 AI 반환값을 그대로 넣지 말고
--      애플리케이션이 3-B에서 결정론적으로 재계산해 저장할 것 (LLM 산수 미신뢰).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ai_evaluation_master` (
  `evaluation_id`    INT UNSIGNED NOT NULL AUTO_INCREMENT
      COMMENT '평가 PK',
  `consultation_id`  INT UNSIGNED NOT NULL
      COMMENT 'FK → consultation_master (한 상담에 여러 평가 가능: 1차/모니터링/골든셋)',

  -- 평가메타
  `evaluator`        ENUM('AI_최종','사람_골든셋') NOT NULL
      COMMENT '평가 주체. 모니터링_AI는 저장 주체가 아니라 파이프라인 단계 → 소견은 3-E 로그 참조',
  `ai_model`         VARCHAR(60)  NULL DEFAULT NULL
      COMMENT '사용 AI 모델 (예: claude-opus-4-8). 사람 채점이면 NULL',
  `rubric_version`   VARCHAR(10)  NOT NULL
      COMMENT '적용 루브릭 버전 (예: v1.5)',
  `evaluated_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
      COMMENT '평가 일시',
  `verify_attempts`  TINYINT UNSIGNED NOT NULL DEFAULT 1
      COMMENT '몇 번째 채점 시도가 3중 검증을 통과해 이 행이 되었나 (상세 이력은 3-E)',

  -- 분류 (①.5 단계 — N/A의 실제 트리거는 권유유형)
  `consult_type_ai`  ENUM('신규·보장','계약변경','해지·환급','보험금청구','단순문의') NOT NULL
      COMMENT 'AI가 판정한 상담유형',
  `consult_type_basis` TEXT       NULL
      COMMENT '유형 판정 근거',
  `recommend_type`   ENUM('없음','신규판매','유지·해지방어·승환') NOT NULL
      COMMENT '권유유형 — D영역 N/A 스위치. 없음=D1~D6 N/A / 신규판매=D 전체 / 유지등=D6만',
  `recommend_basis`  TEXT         NULL
      COMMENT '권유유형 판정 근거',

  -- 판매정보 (권유유형=신규판매일 때만 채움, 그 외 전부 NULL)
  `product_code`     ENUM('P1','P2','P3','P4','P5','P6','P7') NULL DEFAULT NULL
      COMMENT '권유 상품코드 (P1종신~P7어린이)',
  `product_name`     VARCHAR(60)  NULL DEFAULT NULL,
  `needs_scenario`   ENUM('N1','N2','N3','N4','N5','N6','N7','N8') NULL DEFAULT NULL
      COMMENT '매칭표 니즈 시나리오. 판단 불가 시 NULL',
  `matching_verdict` ENUM('적합','부적합','명백한 오류') NULL DEFAULT NULL
      COMMENT 'D2 결과축 (정답지=니즈상품_매칭표 v1.0)',
  `checked_purpose`  TINYINT(1)   NULL DEFAULT NULL
      COMMENT 'D2 절차축① 가입목적 확인 여부',
  `checked_finance`  TINYINT(1)   NULL DEFAULT NULL
      COMMENT 'D2 절차축② 재정상황 확인 여부',
  `checked_existing` TINYINT(1)   NULL DEFAULT NULL
      COMMENT 'D2 절차축③ 기존계약 확인 여부 — 앱이 true 개수로 3×3 게이트 적용',
  `verdict_basis`    TEXT         NULL
      COMMENT '매칭 판정 근거',

  -- 집계 (★앱이 3-B에서 재계산해 저장)
  `raw_score_sum`    DECIMAL(5,1) NOT NULL DEFAULT 0
      COMMENT '원점수합 — 해당없음 제외 항목의 획득점수 합',
  `applied_max_sum`  DECIMAL(5,1) NOT NULL DEFAULT 0
      COMMENT '적용배점합 — 100 - (해당없음 배점 합) = 환산 분모',
  `final_score`      DECIMAL(4,1) NOT NULL DEFAULT 0
      COMMENT '환산총점 = round(원점수합/적용배점합*100, 1)',
  `risk_flagged`     TINYINT(1)   NOT NULL DEFAULT 0
      COMMENT '위험표시여부 — 플래그 1개 이상이면 1 (R3·R4 단독 건도 위험행 노출)',
  `status_label`     ENUM('정상','불완전판매 의심','저점수') NOT NULL DEFAULT '정상'
      COMMENT '상태라벨. 우선순위: 불완전판매 의심 > 저점수 > 정상 (컷값 70은 앱 설정 파라미터)',

  -- 고객만족 (상담사 평가와 별개 레이어)
  `csat_grade`       ENUM('매우 불만족','불만족','보통','만족','매우 만족') NULL DEFAULT NULL,
  `csat_score`       TINYINT UNSIGNED NULL DEFAULT NULL
      COMMENT '0~100 점수형 (등급/점수 중 운영에서 쓰는 쪽 채움)',
  `csat_basis`       TEXT         NULL,

  -- 요약·피드백
  `summary`          TEXT         NOT NULL
      COMMENT '상담 핵심 1~3문장 요약',
  `overall_feedback` TEXT         NOT NULL
      COMMENT '점수가 아닌 개선 조언·지적',

  -- 감사(audit)용 원본 보존
  `ai_output_json`   JSON         NULL DEFAULT NULL
      COMMENT 'AI가 반환한 원본 JSON 전문 — 재계산·분쟁 시 대조용',

  PRIMARY KEY (`evaluation_id`),
  -- 상담당 주체별 평가 1건 — AI 최종본 유일성 보장
  UNIQUE INDEX `uq_eval_consult_evaluator` (`consultation_id`, `evaluator`),
  INDEX `idx_eval_consultation` (`consultation_id`),
  INDEX `idx_eval_status` (`status_label`, `final_score`),
  CONSTRAINT `fk_eval_consultation`
    FOREIGN KEY (`consultation_id`)
    REFERENCES `consultation_master` (`consultation_id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `chk_csat_score` CHECK (`csat_score` IS NULL OR `csat_score` <= 100)
) ENGINE = InnoDB
  COMMENT = '3-A. 평가 결과 마스터 — 평가 1건의 헤더(분류·판매정보·집계·고객만족)';

-- ---------------------------------------------------------------------
-- 3-B. 항목별 평가 상세
--    평가 1건당 정확히 18행 (루브릭 v1.5 — A1~E2).
--    적용 안 되는 항목도 삭제하지 않고 충족수준='해당없음'으로 저장.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ai_evaluation_details` (
  `detail_id`     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `evaluation_id` INT UNSIGNED NOT NULL
      COMMENT 'FK → ai_evaluation_master',
  `item_code`     ENUM('A1','A2','A3','B1','B2','B3','B4',
                       'C1','C2','C3',
                       'D1','D2','D3','D4','D5','D6',
                       'E1','E2') NOT NULL
      COMMENT '루브릭 항목 코드',
  `level`         ENUM('충족','부분충족','미충족','해당없음') NOT NULL
      COMMENT '충족수준 (3단계 앵커 + N/A)',
  `max_score`     DECIMAL(3,1) NOT NULL
      COMMENT '배점 (v1.5 고정: A=4×3 / B1=8,B2~4=6 / C=6×3 / D1=7,D2=5,D3=5,D4=4,D5=4,D6=5 / E=7×2)',
  `earned_score`  DECIMAL(3,1) NOT NULL DEFAULT 0
      COMMENT '획득점수 — 충족=배점, 부분충족=배점/2(2.5 가능), 미충족·해당없음=0',
  `comment`       TEXT         NULL
      COMMENT '판정 사유 코멘트',
  PRIMARY KEY (`detail_id`),
  UNIQUE INDEX `uq_eval_item` (`evaluation_id`, `item_code`),
  CONSTRAINT `fk_details_eval`
    FOREIGN KEY (`evaluation_id`)
    REFERENCES `ai_evaluation_master` (`evaluation_id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `chk_earned_le_max` CHECK (`earned_score` <= `max_score`)
) ENGINE = InnoDB
  COMMENT = '3-B. 항목별 평가 — 평가 1건 × 18항목';

-- ---------------------------------------------------------------------
-- 3-C. 위험 플래그
--    감지된 것만 저장 (없으면 0행). 규칙 1~6 = 루브릭 v1.5 §3.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ai_evaluation_risk_flags` (
  `flag_id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `evaluation_id`     INT UNSIGNED NOT NULL
      COMMENT 'FK → ai_evaluation_master',
  `rule_number`       TINYINT UNSIGNED NOT NULL
      COMMENT '1=D6위반 / 2=D1핵심누락(원금손실 실재 상품만) / 3=B1오정보 / 4=C3+강한불만 / 5=D영역<50%(신규판매만) / 6=D2 명백한 오류',
  `related_item_code` ENUM('A1','A2','A3','B1','B2','B3','B4',
                           'C1','C2','C3',
                           'D1','D2','D3','D4','D5','D6',
                           'E1','E2') NULL DEFAULT NULL,
  `basis`             TEXT         NOT NULL
      COMMENT '플래그 발동 근거',
  PRIMARY KEY (`flag_id`),
  INDEX `idx_flags_eval` (`evaluation_id`),
  INDEX `idx_flags_rule` (`rule_number`),
  CONSTRAINT `fk_flags_eval`
    FOREIGN KEY (`evaluation_id`)
    REFERENCES `ai_evaluation_master` (`evaluation_id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `chk_rule_range` CHECK (`rule_number` BETWEEN 1 AND 6)
) ENGINE = InnoDB
  COMMENT = '3-C. 위험 플래그 — 규칙 1~6 발동 기록';

-- ---------------------------------------------------------------------
-- 3-D. 항목별 근거 인용 (★신규 제안)
--    출력스키마의 항목평가[].근거[] (대화ID + 인용문)를 담는 테이블.
--    항목 1개에 근거 여러 개가 붙을 수 있어 3-B에 넣지 않고 분리.
--    dialogue_id FK가 "점수 클릭 → 해당 발화로 텍스트 점프" 기능의 연결고리.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ai_evaluation_evidences` (
  `evidence_id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `detail_id`   INT UNSIGNED NOT NULL
      COMMENT 'FK → ai_evaluation_details (어느 항목 판정의 근거인가)',
  `dialogue_id` INT UNSIGNED NULL DEFAULT NULL
      COMMENT 'FK → consultation_dialogues. AI가 대화ID를 못 특정하면 NULL 허용',
  `quote`       TEXT         NOT NULL
      COMMENT '원문 그대로 인용 (요약·각색 금지)',
  PRIMARY KEY (`evidence_id`),
  INDEX `idx_evidence_detail` (`detail_id`),
  INDEX `idx_evidence_dialogue` (`dialogue_id`),
  CONSTRAINT `fk_evidence_detail`
    FOREIGN KEY (`detail_id`)
    REFERENCES `ai_evaluation_details` (`detail_id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_evidence_dialogue`
    FOREIGN KEY (`dialogue_id`)
    REFERENCES `consultation_dialogues` (`dialogue_id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE = InnoDB
  COMMENT = '3-D. 근거 인용 — 점수 클릭→텍스트 점프의 연결고리';

-- ---------------------------------------------------------------------
-- 3-E. 채점 파이프라인 검증 로그 (★신규)
--    시도(attempt) × 단계(stage) 단위로 1행. 실패한 시도의 채점 JSON도
--    candidate_json에 보존 → "왜 재시도됐나"를 나중에 추적 가능.
--    consultation_id 기준으로 남기는 이유: 실패 시도는 3-A에 행이
--    없으므로 evaluation_id에만 걸면 실패 이력이 고아가 됨.
--    최종 통과본이 저장되면 evaluation_id를 역으로 채워 연결.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ai_evaluation_verify_log` (
  `log_id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `consultation_id` INT UNSIGNED NOT NULL
      COMMENT 'FK → consultation_master (실패 시도도 상담에는 귀속)',
  `evaluation_id`   INT UNSIGNED NULL DEFAULT NULL
      COMMENT 'FK → ai_evaluation_master. 최종 통과본 저장 후 역참조로 채움 (실패 시도는 NULL 유지)',
  `attempt_no`      TINYINT UNSIGNED NOT NULL
      COMMENT '채점 시도 회차 (1, 2, 3, …)',
  `stage`           ENUM('형식검증','인용대조','교차검증','정본교체','검수폐기') NOT NULL
      COMMENT '①형식검증(스키마·배점 정합) ②인용 원문대조(코드 — 근거 인용문 vs 대화원문) ③내용 교차검증(2차 LLM) / 정본교체=재채점 덮어쓰기로 폐기된 이전 정본 보존(★v4 — candidate_json에 원본 전문) / 검수폐기=재채점·철회로 삭제되는 3-F 검수 보존(★v5 — candidate_json에 검수 전문)',
  `checker`         ENUM('코드','LLM') NOT NULL
      COMMENT '검증 수행 주체. ①②=코드, ③=LLM',
  `checker_model`   VARCHAR(60)  NULL DEFAULT NULL
      COMMENT '③단계 검증 LLM 모델명 (코드 검증이면 NULL)',
  `passed`          TINYINT(1)   NOT NULL
      COMMENT '해당 단계 통과 여부',
  `issues`          TEXT         NULL
      COMMENT '발견된 문제 (형식 위반 목록 / 불일치 인용문 / 2차 LLM 이견 등)',
  `candidate_json`  JSON         NULL DEFAULT NULL
      COMMENT '이 시도의 1차 채점 JSON 원본 — 시도당 1회만 저장해도 충분(예: 각 attempt의 첫 stage 행)',
  `created_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  UNIQUE INDEX `uq_verify_attempt_stage` (`consultation_id`, `attempt_no`, `stage`),
  INDEX `idx_verify_eval` (`evaluation_id`),
  CONSTRAINT `fk_verify_consultation`
    FOREIGN KEY (`consultation_id`)
    REFERENCES `consultation_master` (`consultation_id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_verify_eval`
    FOREIGN KEY (`evaluation_id`)
    REFERENCES `ai_evaluation_master` (`evaluation_id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE = InnoDB
  COMMENT = '3-E. 파이프라인 검증 로그 — 형식검증·인용대조·교차검증 이력';

-- ---------------------------------------------------------------------
-- 3-F. 검수 헤더 (★v5 신설 — 검수_쓰기_API계약_v1.md)
--    사람(QA 담당자) 검수: 검수확정·코멘트 + 유효 집계 물질화.
--    평가 1건당 검수 최대 1건 (재검수는 갱신 — UNIQUE evaluation_id).
--    ※ AI 원본 불변 원칙: 검수는 3-A/3-B를 UPDATE하지 않고 이 레이어에 얹는다.
--    ※ 재채점 시 CASCADE로 함께 삭제됨 — 삭제 직전 3-E stage='검수폐기' 보존은
--      코드 책임 (보존 없는 삭제 경로 금지 — 계약 §2 Do NOT).
--      확정(review_status='확정') 건은 배치 재채점 기본 스킵 대상 (계약 결정 3).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `evaluation_reviews` (
  `review_id`       INT UNSIGNED NOT NULL AUTO_INCREMENT
      COMMENT '검수 PK',
  `evaluation_id`   INT UNSIGNED NOT NULL
      COMMENT 'FK → ai_evaluation_master. 대상 평가 (재채점 시 새 평가에 자동 승계하지 않음)',
  `review_status`   ENUM('검수중','확정') NOT NULL DEFAULT '검수중'
      COMMENT '확정 = 재채점 기본 스킵 보호. 확정→검수중 되돌림(확정 해제) 허용 — 계약 §3.1',
  `reviewer`        VARCHAR(64)  NOT NULL
      COMMENT '검수자. MVP: 자유 문자열(로그인 없음) — 인증 도입 시 FK 전환',
  `review_comment`  TEXT         NULL DEFAULT NULL
      COMMENT '검수 코멘트 (화면② 하단)',
  -- 유효 집계 물질화 (계약 결정 2-A: 화면=유효값 / 검증 경로=AI 원본).
  -- override 없으면 AI 값과 동일 복사 — 쓰기 v0(확정+코멘트만)에서는 항상 복사.
  -- 계산은 saveFinalEvaluation과 동일한 computeAggregates만 사용 (별도 산식 금지).
  `final_score_effective`  DECIMAL(4,1) NOT NULL
      COMMENT '검수 반영 환산총점 — 저장 시점 재계산 물질화',
  `status_label_effective` ENUM('정상','불완전판매 의심','저점수') NOT NULL
      COMMENT '검수 반영 상태라벨 (컷은 저장 시점 app_config — 3-A와 동일 의미론)',
  `risk_flagged_effective` TINYINT(1)   NOT NULL
      COMMENT '검수 반영 위험표시여부',
  `reviewed_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                    ON UPDATE CURRENT_TIMESTAMP
      COMMENT '마지막 검수 수정 시각 (확정 시각과 미구분 — MVP 수용, 필요 시 confirmed_at 분리)',
  PRIMARY KEY (`review_id`),
  UNIQUE INDEX `uq_review_evaluation` (`evaluation_id`),
  CONSTRAINT `fk_review_evaluation`
    FOREIGN KEY (`evaluation_id`)
    REFERENCES `ai_evaluation_master` (`evaluation_id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE = InnoDB
  COMMENT = '3-F. 검수 헤더 — 사람 검수확정·코멘트·유효 집계 (★v5)';

-- ---------------------------------------------------------------------
-- 3-G. 항목별 충족수준 수정 (★v5 신설 — 쓰기 v1에서 기능 개방, 스키마는 지금부터)
--    검수자가 고치는 것은 충족수준(4택)뿐 — 점수 컬럼을 두지 않는다
--    (획득점수·집계는 코드가 규칙값으로 재계산: "판단은 사람이, 계산은 코드가").
--    수정한 항목만 행 존재 (없으면 AI 판정 그대로).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `evaluation_review_overrides` (
  `override_id`    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `review_id`      INT UNSIGNED NOT NULL
      COMMENT 'FK → evaluation_reviews',
  `item_code`      ENUM('A1','A2','A3','B1','B2','B3','B4',
                        'C1','C2','C3',
                        'D1','D2','D3','D4','D5','D6',
                        'E1','E2') NOT NULL
      COMMENT '수정 대상 루브릭 항목',
  `level_original` ENUM('충족','부분충족','미충족','해당없음') NOT NULL
      COMMENT '수정 시점의 AI 판정 스냅샷 (감사 추적 — 3-B 재조회 없이 diff 표시)',
  `level_override` ENUM('충족','부분충족','미충족','해당없음') NOT NULL
      COMMENT '검수자 판정 (점수 직접 입력 없음 — 계약 결정 1 부속)',
  `override_reason` TEXT        NULL DEFAULT NULL
      COMMENT '수정 사유',
  PRIMARY KEY (`override_id`),
  UNIQUE INDEX `uq_override_item` (`review_id`, `item_code`),
  CONSTRAINT `fk_override_review`
    FOREIGN KEY (`review_id`)
    REFERENCES `evaluation_reviews` (`review_id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE = InnoDB
  COMMENT = '3-G. 항목별 충족수준 수정 — AI 원본 불변 검수 레이어 (★v5)';

-- ---------------------------------------------------------------------
-- (선택) 앱 설정 테이블 — 70점 컷 하드코딩 방지
--    인수인계 v14: "컷값은 코드 하드코딩 말고 설정 파라미터로" 반영.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `app_config` (
  `config_key`   VARCHAR(50)  NOT NULL,
  `config_value` VARCHAR(200) NOT NULL,
  `description`  VARCHAR(200) NULL,
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`config_key`)
) ENGINE = InnoDB
  COMMENT = '앱 설정 — 점수 컷 등 담당자 조정 가능 파라미터';

INSERT INTO `app_config` (`config_key`, `config_value`, `description`)
VALUES
  ('low_score_cut', '70', '저점수 상태라벨 기준선 (총점 < 값). 7건 소표본 기준이므로 실운영 시 조정 가능'),
  -- ★v3: 화면④ 항목 달성률 상태 컷 (API 계약 v1 §3.1 thresholds — 프론트 하드코딩 금지)
  ('item_rate_warn', '60', '화면④ 항목 달성률: 값 미만이면 "개선 필요"'),
  ('item_rate_ok',   '80', '화면④ 항목 달성률: 값 이상이면 "양호" (미만~warn 이상은 "보통")'),
  -- ★v8: 채점 파이프라인이 참조할 활성 RAG 컬렉션명 — 관리자 재색인 시 갱신 대상
  ('rag_collection_name', 'policy_v2', '현재 활성 약관 RAG 컬렉션명 (관리자 재색인 시 갱신)')
ON DUPLICATE KEY UPDATE `config_value` = `config_value`;

-- ---------------------------------------------------------------------
-- 4. users — 로그인(인증) 계정 (★v6 신설)
--    정본 계약: docs/db/로그인 설계문서 v1 20260716.md §3.
--    NextAuth(Auth.js) Credentials 방식의 대조 대상 — 실제 보험사처럼
--    회원가입 없음, 계정은 관리자 발급(데모는 시드 1건 qa_manager).
--    CREATE TABLE IF NOT EXISTS 자체가 마이그레이션 (3-F·3-G와 동일 규약 —
--    신설 테이블은 별도 ALTER 블록 불요, 재실행 안전).
--    ⚠ 비밀번호는 여기서 시드하지 않는다 — password_hash는 반드시 bcrypt 해시로,
--       env에서 공급(scripts/seed-user.ts). 평문 하드코딩 금지(설계문서 §3·§13,
--       70컷 하드코딩 금지와 같은 원칙).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username`      VARCHAR(64)  NOT NULL
      COMMENT '로그인 ID (예: qa_manager). 관리자 발급',
  `password_hash` VARCHAR(255) NOT NULL
      COMMENT 'bcrypt 해시 — 원문 저장 금지(설계문서 §1-5)',
  `display_name`  VARCHAR(64)  NOT NULL
      COMMENT '화면 표시명 (헤더 "OOO님" 등)',
  `role`          ENUM('MANAGER','ADMIN') NOT NULL DEFAULT 'MANAGER'
      COMMENT '계정 역할 — MANAGER=QA매니저(채점·검수 운영), ADMIN=관리자(설정·계정 정책, 채점 실행 권한 없음)',
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_username` (`username`)
) ENGINE = InnoDB
  COMMENT = '4. 로그인 계정 — 관리자 발급 인증 계정 (★v6, NextAuth Credentials 대조 대상)';

-- ---------------------------------------------------------------------
-- 5. coaching_tips — 코칭 팁 (★v7 신설)
--    화면④ 개선 필요 항목의 항목코드별 정적 문구. 기존에는
--    lib/db/agentReportRepo.ts의 COACHING_TIPS 상수로 하드코딩돼 있던 것을
--    관리자 화면에서 편집 가능하게 테이블로 이전 (조회 코드 교체는 다음 단계 —
--    이 단계에서는 agentReportRepo.ts를 건드리지 않는다).
--    CREATE TABLE IF NOT EXISTS 자체가 마이그레이션 (4. users와 동일 규약 —
--    신설 테이블은 별도 ALTER 블록 불요, 재실행 안전).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `coaching_tips` (
  `item_code`  VARCHAR(4) NOT NULL
      COMMENT '루브릭 항목 코드 (A1~E2, 18개)',
  `tip_text`   TEXT       NOT NULL
      COMMENT '코칭 팁 문구 — 화면④ 개선 필요 항목에 노출',
  `updated_at` DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`item_code`)
) ENGINE = InnoDB
  COMMENT = '5. 코칭 팁 — 항목코드별 정적 문구 (관리자 편집 대상)';

-- ---------------------------------------------------------------------
-- 6. policy_documents — 관리자 업로드 약관 문서 (★v8 신설)
--    관리자 화면에서 새 약관을 업로드해 RAG 재색인할 때의 원문·이력 보관.
--    활성 컬렉션명은 app_config.rag_collection_name(정본)이 가리킨다.
--    CREATE TABLE IF NOT EXISTS 자체가 마이그레이션 (4. users·5. coaching_tips와
--    동일 규약 — 신설 테이블은 별도 ALTER 블록 불요, 재실행 안전).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `policy_documents` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `filename`         VARCHAR(255) NOT NULL
      COMMENT '업로드 원본 파일명',
  `content`          MEDIUMTEXT   NOT NULL
      COMMENT '약관 전체 텍스트 (재색인 시 재사용)',
  `collection_name`  VARCHAR(100) NOT NULL
      COMMENT '이 문서가 색인된 Chroma 컬렉션명',
  `chunk_count`      INT UNSIGNED NOT NULL
      COMMENT '색인된 조각 수 (collection.count() 결과)',
  `created_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE = InnoDB
  COMMENT = '6. 관리자 업로드 약관 문서 — RAG 재색인 이력';

-- =====================================================================
-- v3 마이그레이션 — agents FK 전환 (기존 v2 DB 전용, 재실행 안전)
--   신규 DB는 위 CREATE TABLE의 인라인 FK로 이미 완료 → 아래는 전부 no-op.
--   기존 DB는 CREATE TABLE IF NOT EXISTS가 건너뛰므로 여기서 이행한다.
--   순서 중요: ① 명부 백필 → ② FK/인덱스 추가 (고아 행이 있으면 FK가 못 붙음)
-- =====================================================================

-- ① 명부 백필 — 상담 데이터에 있지만 명부에 없는 agent_id를 임시 이름(=ID)으로 등록.
--    (시드 6명 외의 ID로 적재된 상담 보호. 이름은 이후 UPDATE로 정정)
INSERT IGNORE INTO `agents` (`agent_id`, `agent_name`)
SELECT DISTINCT `agent_id`, `agent_id` FROM `consultation_master`;

-- ② FK 조건부 추가 — 이미 있으면 건너뜀 (ADD CONSTRAINT IF NOT EXISTS 미지원 우회)
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = 'qa_scope'
     AND TABLE_NAME = 'consultation_master'
     AND CONSTRAINT_NAME = 'fk_master_agent'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @ddl := IF(@fk_exists = 0,
  'ALTER TABLE `consultation_master`
     ADD CONSTRAINT `fk_master_agent`
     FOREIGN KEY (`agent_id`) REFERENCES `agents` (`agent_id`)
     ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT ''fk_master_agent 이미 존재 — 건너뜀''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ③ 복합 인덱스 조건부 추가 (화면④ 상담사×기간 집계용)
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = 'qa_scope'
     AND TABLE_NAME = 'consultation_master'
     AND INDEX_NAME = 'idx_master_agent_date'
);
SET @ddl := IF(@idx_exists = 0,
  'ALTER TABLE `consultation_master`
     ADD INDEX `idx_master_agent_date` (`agent_id`, `consulted_at`)',
  'SELECT ''idx_master_agent_date 이미 존재 — 건너뜀''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =====================================================================
-- v4 마이그레이션 — verify_log stage ENUM에 '정본교체' 추가 (재실행 안전)
--   신규 DB는 위 CREATE TABLE에 이미 포함 → no-op.
--   ENUM 끝에 값 추가는 MySQL 8에서 메타데이터만 바꾸는 변경이라 무중단.
-- =====================================================================
SET @stage_has := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'qa_scope'
     AND TABLE_NAME = 'ai_evaluation_verify_log'
     AND COLUMN_NAME = 'stage'
     AND COLUMN_TYPE LIKE '%정본교체%'
);
SET @ddl := IF(@stage_has = 0,
  'ALTER TABLE `ai_evaluation_verify_log`
     MODIFY COLUMN `stage` ENUM(''형식검증'',''인용대조'',''교차검증'',''정본교체'') NOT NULL
     COMMENT ''①형식검증(스키마·배점 정합) ②인용 원문대조(코드 — 근거 인용문 vs 대화원문) ③내용 교차검증(2차 LLM) / 정본교체=재채점 덮어쓰기로 폐기된 이전 정본 보존(★v4 — candidate_json에 원본 전문)''',
  'SELECT ''stage ENUM에 정본교체 이미 존재 — 건너뜀''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =====================================================================
-- v5 마이그레이션 — verify_log stage ENUM에 '검수폐기' 추가 (재실행 안전)
--   신규 DB는 위 CREATE TABLE에 이미 포함 → no-op. 3-F·3-G 신설은
--   CREATE TABLE IF NOT EXISTS 자체가 마이그레이션이라 별도 블록 불요.
--   ENUM 끝에 값 추가는 MySQL 8에서 메타데이터만 바꾸는 변경이라 무중단
--   (v4 '정본교체' 추가와 동일 패턴 — 검수_쓰기_API계약_v1.md 결정 3 부속).
-- =====================================================================
SET @stage_has_v5 := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'qa_scope'
     AND TABLE_NAME = 'ai_evaluation_verify_log'
     AND COLUMN_NAME = 'stage'
     AND COLUMN_TYPE LIKE '%검수폐기%'
);
SET @ddl := IF(@stage_has_v5 = 0,
  'ALTER TABLE `ai_evaluation_verify_log`
     MODIFY COLUMN `stage` ENUM(''형식검증'',''인용대조'',''교차검증'',''정본교체'',''검수폐기'') NOT NULL
     COMMENT ''①형식검증(스키마·배점 정합) ②인용 원문대조(코드 — 근거 인용문 vs 대화원문) ③내용 교차검증(2차 LLM) / 정본교체=재채점 덮어쓰기로 폐기된 이전 정본 보존(★v4 — candidate_json에 원본 전문) / 검수폐기=재채점·철회로 삭제되는 3-F 검수 보존(★v5 — candidate_json에 검수 전문)''',
  'SELECT ''stage ENUM에 검수폐기 이미 존재 — 건너뜀''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =====================================================================
-- v6 마이그레이션 — users 테이블에 role 컬럼 추가 (재실행 안전)
--   신규 DB는 위 CREATE TABLE에 이미 포함 → no-op.
--   기존 DB는 CREATE TABLE IF NOT EXISTS가 건너뛰므로 여기서 이행한다.
-- =====================================================================
SET @role_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'qa_scope'
     AND TABLE_NAME = 'users'
     AND COLUMN_NAME = 'role'
);
SET @ddl := IF(@role_exists = 0,
  'ALTER TABLE `users`
     ADD COLUMN `role` ENUM(''MANAGER'',''ADMIN'') NOT NULL DEFAULT ''MANAGER''
     COMMENT ''계정 역할 — MANAGER=QA매니저(채점·검수 운영), ADMIN=관리자(설정·계정 정책, 채점 실행 권한 없음)''
     AFTER `display_name`',
  'SELECT ''role 컬럼 이미 존재 — 건너뜀''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET SQL_MODE=@OLD_SQL_MODE;
SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;
