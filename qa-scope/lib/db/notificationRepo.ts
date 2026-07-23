/**
 * lib/db/notificationRepo.ts — notifications (불완전판매 의심 알림) 접근
 *
 * 정본: scripts/schema.sql §7(★v9). 생성은 채점 파이프라인
 * (lib/scoring/pipeline.ts — 저장 완료 직후)만 하고, 조회·읽음 처리는
 * /api/notifications가 담당한다. type 컬럼 없음 — 알림 대상이
 * 불완전판매 의심 하나뿐 (팀 결정 2026-07-20).
 */
import { pool, query } from './pool';
import type { ResultSetHeader } from 'mysql2/promise';

export interface NotificationRow {
  notification_id: number;
  evaluation_id: number;
  message: string;
  /** 0=미읽음, 1=읽음 — 읽어도 삭제 전까지 목록에 회색으로 남는다 */
  is_read: 0 | 1;
  /** pool dateStrings — 'YYYY-MM-DD HH:MM:SS' (KST 벽시계 문자열 그대로) */
  created_at: string;
}

/**
 * 알림 생성 — 파이프라인 전용.
 * DB 에러는 그대로 throw한다 — "실패가 채점 저장을 막으면 안 되지만 조용히
 * 삼키지 않는다"는 정책의 try/catch·console.error는 호출부(pipeline.ts) 책임.
 */
export async function createNotification(evaluationId: number, message: string): Promise<void> {
  await query(
    'INSERT INTO `notifications` (`evaluation_id`, `message`) VALUES (?, ?)',
    [evaluationId, message],
  );
}

/**
 * 알림 목록 — 읽음 여부와 무관하게 최신순 (읽은 알림은 화면에서 회색 표시,
 * 삭제 버튼으로만 목록에서 사라진다). 배지의 미읽음 수는 호출부가
 * is_read=0 필터로 계산. created_at 동률(같은 초) 대비 notification_id를
 * 2차 정렬키로 둔다.
 */
export async function listRecent(limit = 50): Promise<NotificationRow[]> {
  return query<NotificationRow>(
    `SELECT \`notification_id\`, \`evaluation_id\`, \`message\`, \`is_read\`, \`created_at\`
       FROM \`notifications\`
      ORDER BY \`created_at\` DESC, \`notification_id\` DESC
      LIMIT ?`,
    [limit],
  );
}

/**
 * 읽음 처리 — 멱등(이미 읽음이어도 존재하면 true).
 * @returns 대상 알림이 존재하면 true, 없으면 false (404 판정용).
 */
export async function markRead(notificationId: number): Promise<boolean> {
  const [res] = await pool.query<ResultSetHeader>(
    'UPDATE `notifications` SET `is_read` = 1 WHERE `notification_id` = ?',
    [notificationId],
  );
  if (res.affectedRows > 0) return true;

  // affectedRows=0은 "없는 알림"과 "이미 읽음(무변경)"을 구분 못 한다
  // (MySQL 기본 설정 — 실제로 바뀐 행만 센다. coachingTipsRepo.updateTip과
  // 동일 사유) — 존재 여부를 다시 확인해 멱등 재요청을 404로 오판하지 않는다.
  const rows = await query('SELECT 1 FROM `notifications` WHERE `notification_id` = ?', [
    notificationId,
  ]);
  return rows.length > 0;
}

/**
 * 알림 개별 삭제 — 드롭다운 항목의 X 버튼용.
 * @returns 삭제됐으면 true, 대상이 없으면 false (404 판정용).
 */
export async function deleteOne(notificationId: number): Promise<boolean> {
  const [res] = await pool.query<ResultSetHeader>(
    'DELETE FROM `notifications` WHERE `notification_id` = ?',
    [notificationId],
  );
  return res.affectedRows > 0;
}

/**
 * 읽은 알림 일괄 삭제 — '읽은 알림 삭제' 버튼용. 미읽음은 건드리지 않는다.
 * @returns 삭제된 행 수.
 */
export async function deleteRead(): Promise<number> {
  const [res] = await pool.query<ResultSetHeader>(
    'DELETE FROM `notifications` WHERE `is_read` = 1',
  );
  return res.affectedRows;
}
