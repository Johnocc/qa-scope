/**
 * app/api/health/route.ts — 헬스체크 (GET /api/health)
 */
import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    await db.query('SELECT 1');
    const cut = await db.config.getNumber('low_score_cut', 70);
    return NextResponse.json({ ok: true, db: 'up', lowScoreCut: cut });
  } catch (err: any) {
    return NextResponse.json({ ok: false, db: 'down', error: err.message }, { status: 503 });
  }
}
