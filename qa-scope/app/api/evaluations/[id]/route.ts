/**
 * app/api/evaluations/[id]/route.ts — 채점 상세 (GET /api/evaluations/:id)
 *
 * 화면 ②(채점 상세)용:
 *  - evaluation: 출력스키마 ver2 형태로 재조립된 평가 1건
 *    (근거에 dialogue_id 포함 → "점수 클릭 → 원문 점프"의 연결고리)
 *  - dialogues: 좌측 상담 원문 전체 (turn_order 순)
 */
import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const evaluationId = Number(id);
    if (!Number.isInteger(evaluationId) || evaluationId <= 0) {
      return NextResponse.json({ error: '잘못된 평가 ID' }, { status: 400 });
    }

    const evaluation = await db.evaluations.getFullEvaluation(evaluationId);
    if (!evaluation) {
      return NextResponse.json({ error: '평가를 찾을 수 없음' }, { status: 404 });
    }

    const consultation = await db.consultations.findConsultation(evaluation.상담ID);
    const dialogues = consultation
      ? await db.consultations.getDialogues(consultation.consultation_id)
      : [];

    return NextResponse.json({ evaluation, dialogues });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
