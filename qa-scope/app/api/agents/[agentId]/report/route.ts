/**
 * app/api/agents/[agentId]/report/route.ts — 상담사 개인 평가 리포트
 * (GET /api/agents/:agentId/report?period=30d|90d|all)
 *
 * 화면 ④(개인 리포트)용. 응답 형태·에러 코드는 계약 문서가 정본:
 *   docs/api/화면4_상담사리포트_API계약_v1.md
 * 프론트 스텁: schemas/agent-report.v1.example.json (같은 형태)
 */
import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { isPeriod } from '@/lib/db/agentReportRepo';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const { agentId } = await params;
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') ?? '30d';

    if (!isPeriod(period)) {
      return NextResponse.json({ error: 'invalid period' }, { status: 400 });
    }

    const report = await db.agentReport.buildAgentReport(agentId, period);
    if (!report) {
      return NextResponse.json({ error: 'agent not found' }, { status: 404 });
    }

    return NextResponse.json(report);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
