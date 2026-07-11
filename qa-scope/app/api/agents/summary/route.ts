/**
 * app/api/agents/summary/route.ts — 상담사별 대시보드
 * (GET /api/agents/summary?period=30d|90d|all)
 *
 * 화면 ③(대시보드)용. 응답 형태·에러 코드는 계약 문서가 정본:
 *   docs/api/화면3_상담사대시보드_API계약_v1.md
 * 프론트 스텁: schemas/agents-summary.v1.example.json (같은 형태)
 *
 * 집계는 화면④와 같은 로직(lib/db/agentReportRepo.ts)을 재사용한다 —
 * 같은 기간이면 ③의 수치가 ④에서 그대로 재현돼야 한다 (계약 §4 정합 표).
 * 라우팅: 정적 /api/agents/summary가 동적 /api/agents/[agentId]/…보다
 * 우선 매칭되므로 충돌 없음 (계약 §2 주의 — 명부에 'summary' ID 금지 전제).
 */
import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { isPeriod } from '@/lib/db/agentReportRepo';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') ?? '30d';

    if (!isPeriod(period)) {
      return NextResponse.json({ error: 'invalid period' }, { status: 400 });
    }

    const summary = await db.agentReport.buildAgentsSummary(period);
    return NextResponse.json(summary);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
