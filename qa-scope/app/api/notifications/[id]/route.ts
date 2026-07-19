/**
 * app/api/notifications/[id]/route.ts — 알림 읽음 처리 (PATCH)
 *
 * 접근 제어는 proxy.ts에서 처리(목록 GET과 동일). 벨 드롭다운에서 항목 클릭 시
 * 호출된다 — 읽음 처리는 멱등(이미 읽음이어도 200), 없는 ID만 404.
 */
import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const notificationId = Number(id);
  if (!Number.isInteger(notificationId) || notificationId <= 0) {
    return NextResponse.json(
      { error: 'invalid id', message: '알림 ID가 올바르지 않습니다' },
      { status: 400 },
    );
  }

  try {
    const found = await db.notifications.markRead(notificationId);
    if (!found) {
      return NextResponse.json(
        { error: 'not found', message: '알림을 찾을 수 없습니다' },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[notifications] 읽음 처리 실패:', err);
    return NextResponse.json(
      { error: 'internal error', message: '읽음 처리에 실패했습니다' },
      { status: 500 },
    );
  }
}
