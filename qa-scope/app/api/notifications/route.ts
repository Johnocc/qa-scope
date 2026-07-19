/**
 * app/api/notifications/route.ts — 알림 목록 (GET) + 읽은 알림 일괄 삭제 (DELETE)
 *
 * 접근 제어는 proxy.ts에서 처리 — 미인증 401, ADMIN 403(역할 완전 분리 B안),
 * MANAGER만 통과. 헤더 벨(NotificationBell)이 30초 폴링으로 호출한다.
 *
 * GET 응답: { notifications: [{ notification_id, evaluation_id, message,
 *   is_read, created_at }] } — 읽음 포함 최신순(읽은 알림은 화면에서 회색 보관).
 *   배지의 미읽음 수는 클라이언트가 is_read=0 필터로 계산.
 * DELETE 응답: { deleted: n } — is_read=1인 알림만 일괄 삭제('읽은 알림 삭제' 버튼).
 *
 * ※ 읽음·삭제 상태는 전 계정 공유(단일 매니저 시연 전제 — 팀 결정 2026-07-20).
 *   계정별 분리는 다중 매니저 도입 시 별도 작업.
 */
import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    const notifications = await db.notifications.listRecent();
    return NextResponse.json({ notifications });
  } catch (err) {
    console.error('[notifications] 목록 조회 실패:', err);
    return NextResponse.json(
      { error: 'internal error', message: '알림 목록을 불러오지 못했습니다' },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    const deleted = await db.notifications.deleteRead();
    return NextResponse.json({ deleted });
  } catch (err) {
    console.error('[notifications] 읽은 알림 일괄 삭제 실패:', err);
    return NextResponse.json(
      { error: 'internal error', message: '읽은 알림 삭제에 실패했습니다' },
      { status: 500 },
    );
  }
}
