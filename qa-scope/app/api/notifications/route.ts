/**
 * app/api/notifications/route.ts — 미읽음 알림 목록 (GET)
 *
 * 접근 제어는 proxy.ts에서 처리 — 미인증 401, ADMIN 403(역할 완전 분리 B안),
 * MANAGER만 통과. 헤더 벨(NotificationBell)이 30초 폴링으로 호출한다.
 *
 * 응답: { notifications: [{ notification_id, evaluation_id, message, created_at }] }
 * — 최신순. 배지 개수는 배열 길이로 계산한다(30초 폴링 규모라 별도 count API 불요).
 */
import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    const notifications = await db.notifications.listUnread();
    return NextResponse.json({ notifications });
  } catch (err) {
    console.error('[notifications] 목록 조회 실패:', err);
    return NextResponse.json(
      { error: 'internal error', message: '알림 목록을 불러오지 못했습니다' },
      { status: 500 },
    );
  }
}
