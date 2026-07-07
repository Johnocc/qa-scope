/**
 * app/api/evaluations/route.ts — 대시보드 목록 (GET /api/evaluations)
 * 쿼리스트링: ?status=저점수&limit=50&offset=0
 */
import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rows = await db.evaluations.listForDashboard({
      statusLabel: searchParams.get('status') || null,
      limit: Number(searchParams.get('limit') ?? 50),
      offset: Number(searchParams.get('offset') ?? 0),
    });
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
