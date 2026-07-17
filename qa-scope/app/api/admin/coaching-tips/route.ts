/**
 * app/api/admin/coaching-tips/route.ts — 코칭 팁 목록 조회(GET)·수정(PUT)
 *
 * 접근 제어는 proxy.ts에서 처리(ADMIN 전용, 그 외 role은 403) — 이 라우트
 * 핸들러는 이미 ADMIN으로 통과된 요청만 받는다고 가정한다.
 */
import { NextResponse } from 'next/server';
import { listTips, updateTip } from '@/lib/db/coachingTipsRepo';
import { ITEM_CODES, type ItemCode } from '@/lib/scoring/constants';

export async function GET() {
  const items = await listTips();
  return NextResponse.json({ items });
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  const item_code = body?.item_code;
  const tip_text = body?.tip_text;

  if (typeof item_code !== 'string' || !(ITEM_CODES as readonly string[]).includes(item_code)) {
    return NextResponse.json(
      { error: 'invalid item_code', message: '알 수 없는 항목 코드입니다' },
      { status: 400 },
    );
  }

  if (typeof tip_text !== 'string' || tip_text.trim() === '') {
    return NextResponse.json(
      { error: 'invalid tip_text', message: '문구를 입력하세요' },
      { status: 400 },
    );
  }

  const trimmedTip = tip_text.trim();
  const updated = await updateTip(item_code as ItemCode, trimmedTip);
  if (!updated) {
    return NextResponse.json(
      { error: 'not found', message: '해당 항목을 찾을 수 없습니다' },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, item_code, tip_text: trimmedTip });
}
