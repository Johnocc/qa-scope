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

/** 코칭 팁 upsert — 시드 스크립트용. 이미 있으면 문구만 갱신(재실행 안전). */
export async function upsertTip(itemCode: ItemCode, tipText: string): Promise<void> {
  await query(
    `INSERT INTO \`coaching_tips\` (\`item_code\`, \`tip_text\`)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE \`tip_text\` = VALUES(\`tip_text\`)`,
    [itemCode, tipText],
  );
}
