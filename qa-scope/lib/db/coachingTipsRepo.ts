/**
 * lib/db/coachingTipsRepo.ts — coaching_tips (항목코드별 코칭 팁 문구) 접근
 *
 * 정본: scripts/schema.sql §5(★v7). 시드 스크립트(seed-coaching-tips.ts)가
 * 이 모듈을 통해 쓴다. 조회 경로(agentReportRepo.ts 교체)는 다음 단계.
 */
import { pool, query } from './pool';
import type { ResultSetHeader } from 'mysql2/promise';
import type { ItemCode } from '../scoring/constants';

export interface CoachingTip {
  item_code: ItemCode;
  tip_text: string;
}

/** GET 목록(관리자 화면)용 — coaching_tips 전체 컬럼. */
export interface CoachingTipRow extends CoachingTip {
  updated_at: string;
}

/**
 * 전체 코칭 팁 조회 — { item_code: tip_text } 맵으로 반환.
 * DB 에러는 그대로 throw한다 (조용히 빈 객체로 폴백하지 않음 — 호출부가 처리).
 */
export async function getAllTips(): Promise<Record<string, string>> {
  const rows = await query<CoachingTip>('SELECT `item_code`, `tip_text` FROM `coaching_tips`');
  const tips: Record<string, string> = {};
  for (const row of rows) {
    tips[row.item_code] = row.tip_text;
  }
  return tips;
}

/** 코칭 팁 upsert — 시드 스크립트용. 이미 있으면 문구만 갱신(재실행 안전). */
export async function upsertTip(itemCode: ItemCode, tipText: string): Promise<void> {
  await query(
    `INSERT INTO \`coaching_tips\` (\`item_code\`, \`tip_text\`)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE \`tip_text\` = VALUES(\`tip_text\`)`,
    [itemCode, tipText],
  );
}

/** 전체 코칭 팁 목록 — item_code 오름차순, updated_at 포함 (관리자 화면 GET용). */
export async function listTips(): Promise<CoachingTipRow[]> {
  return query<CoachingTipRow>(
    'SELECT `item_code`, `tip_text`, `updated_at` FROM `coaching_tips` ORDER BY `item_code`',
  );
}

/**
 * 코칭 팁 수정 — 관리자 편집용 UPDATE 전용(행 추가는 upsertTip/시드만 담당).
 * @returns 대상 item_code가 존재하면 true(값이 그대로여도 성공), 없으면 false.
 */
export async function updateTip(itemCode: ItemCode, tipText: string): Promise<boolean> {
  const [res] = await pool.query<ResultSetHeader>(
    'UPDATE `coaching_tips` SET `tip_text` = ? WHERE `item_code` = ?',
    [tipText, itemCode],
  );
  if (res.affectedRows > 0) return true;

  // affectedRows=0은 "없는 코드"와 "값이 안 바뀐 무변경 저장"을 구분 못 한다
  // (MySQL 기본 설정 — 실제로 바뀐 행만 센다). 존재 여부를 다시 확인해
  // 무변경 저장을 404로 오판하지 않게 한다.
  const rows = await query('SELECT 1 FROM `coaching_tips` WHERE `item_code` = ?', [itemCode]);
  return rows.length > 0;
}
