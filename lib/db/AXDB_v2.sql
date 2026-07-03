-- =====================================================================
-- 한빛생명(가상) 콜센터 QA 자동채점 시스템 — DB 스키마 v1.0
-- 기준 문서: 콜센터_DB_스키마.md / 상담평가_출력스키마_ver2.json
--            보험상담_평가루브릭_v1.5 / N_A_매핑규칙_확정본
-- 대상 DBMS: MySQL 8.0+
--
-- 구조 (6개 테이블):
--   1.   consultation_master        상담 마스터
--   2.   consultation_dialogues     상세 대화 내역
--   3-A. ai_evaluation_master       평가 결과 헤더 (분류·판매정보·집계·고객만족·요약·피드백)
--   3-B. ai_evaluation_details      항목별 평가 (18항목 × 평가건)
--   3-C. ai_evaluation_risk_flags   위험 플래그 (규칙 1~6)
--   3-D. ai_evaluation_evidences    항목별 근거 인용 (★ "점수 클릭→텍스트 점프"용)
--   3-E. ai_evaluation_verify_log   채점 파이프라인 검증 로그
--                                   (①형식검증 → ②인용 원문대조(코드) → ③내용 교차검증(2차 LLM))
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
-- =====================================================================

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
-- 1. 상담 마스터 테이블
--    콜센터_DB_스키마.md: 상담ID / 상담사ID / 고객ID / 일시 / 상담유형
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `consultation_master` (
  `consultation_id`   INT UNSIGNED     NOT NULL AUTO_INCREMENT
      COMMENT '상담 PK (내부용 대리키)',
  `consultation_code` VARCHAR(30)      NOT NULL
      COMMENT '대외 표기용 상담 코드 (예: C-2026-018442)',
  `agent_id`          VARCHAR(20)      NOT NULL
      COMMENT '상담사 ID (추후 상담사 테이블 신설 시 FK 전환)',
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
  INDEX `idx_master_consulted_at` (`consulted_at`)
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
  `stage`           ENUM('형식검증','인용대조','교차검증') NOT NULL
      COMMENT '①형식검증(스키마·배점 정합) ②인용 원문대조(코드 — 근거 인용문 vs 대화원문) ③내용 교차검증(2차 LLM)',
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
VALUES ('low_score_cut', '70', '저점수 상태라벨 기준선 (총점 < 값). 7건 소표본 기준이므로 실운영 시 조정 가능')
ON DUPLICATE KEY UPDATE `config_value` = `config_value`;

SET SQL_MODE=@OLD_SQL_MODE;
SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;
