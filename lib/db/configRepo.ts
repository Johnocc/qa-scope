/**
 * lib/db/configRepo.ts — app_config (담당자 조정 가능 파라미터)
 * 인수인계 v14: "컷값 하드코딩 금지, 설정 파라미터로" 반영.
 */
import { query } from './pool';

export async function get(key: string, fallback: string | null = null): Promise<string | null> {
  try {
    const rows = await query<{ config_value: string }>(
      'SELECT config_value FROM app_config WHERE config_key = ? LIMIT 1',
      [key],
    );
    return rows[0] ? rows[0].config_value : fallback;
  } catch {
    return fallback; // DB 미기동 등 — 폴백값으로 동작 지속
  }
}

export async function getNumber(key: string, fallback: number): Promise<number> {
  const v = await get(key, null);
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function set(key: string, value: string | number, description: string | null = null): Promise<void> {
  await query(
    `INSERT INTO app_config (config_key, config_value, description)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE config_value = VALUES(config_value),
                             description = COALESCE(VALUES(description), description)`,
    [key, String(value), description],
  );
}
