/**
 * app/api/admin/config/route.ts — 관리자 설정 저장 (PUT)
 *
 * 접근 제어는 proxy.ts에서 처리(ADMIN 전용, 그 외 role은 403) — 이 라우트
 * 핸들러는 이미 ADMIN으로 통과된 요청만 받는다고 가정한다.
 */
import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  const low_score_cut = body?.low_score_cut;

  if (
    typeof low_score_cut !== 'number' ||
    !Number.isFinite(low_score_cut) ||
    low_score_cut < 0 ||
    low_score_cut > 100
  ) {
    return NextResponse.json(
      { error: 'invalid low_score_cut', message: '컷은 0~100 사이 숫자여야 합니다' },
      { status: 400 },
    );
  }

  await db.config.set('low_score_cut', low_score_cut, '저점수 컷 (관리자 설정)');

  return NextResponse.json({ ok: true, low_score_cut });
}
