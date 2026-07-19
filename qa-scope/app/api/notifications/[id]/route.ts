/**
 * app/api/notifications/[id]/route.ts — 알림 읽음 처리 (PATCH) + 개별 삭제 (DELETE)
 *
 * 접근 제어는 proxy.ts에서 처리(목록 GET과 동일). 벨 드롭다운에서
 * 항목 클릭(PATCH — 멱등, 이미 읽음이어도 200) / X 버튼(DELETE) 시 호출된다.
 * 없는 ID만 404.
 */
import { NextResponse } from 'next/server';
import db from '@/lib/db';

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const notificationId = parseId(id);
  if (notificationId === null) {
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const notificationId = parseId(id);
  if (notificationId === null) {
    return NextResponse.json(
      { error: 'invalid id', message: '알림 ID가 올바르지 않습니다' },
      { status: 400 },
    );
  }

  try {
    const deleted = await db.notifications.deleteOne(notificationId);
    if (!deleted) {
      return NextResponse.json(
        { error: 'not found', message: '알림을 찾을 수 없습니다' },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[notifications] 삭제 실패:', err);
    return NextResponse.json(
      { error: 'internal error', message: '알림 삭제에 실패했습니다' },
      { status: 500 },
    );
  }
}
