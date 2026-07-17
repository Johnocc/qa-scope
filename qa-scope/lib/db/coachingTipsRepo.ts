/**
 * lib/db/coachingTipsRepo.ts — coaching_tips (항목코드별 코칭 팁 문구) 접근
 *
 * 정본: scripts/schema.sql §5(★v7). 시드 스크립트(seed-coaching-tips.ts)가
 * 이 모듈을 통해 쓴다. 조회 경로(agentReportRepo.ts 교체)는 다음 단계.
 */
import { query } from './pool';
import type { ItemCode } from '../scoring/constants';

export interface CoachingTip {
  item_code: ItemCode;
  tip_text: string;
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
