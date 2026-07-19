/**
 * app/api/evaluations/[id]/route.ts — 채점 상세 (GET /api/evaluations/:id)
 *
 * 화면 ②(채점 상세)용 — 정본 계약: docs/api/화면2_채점상세_API계약_v1.md
 *  - header: 상단 헤더 (상담사명·유형·위험 태그·상태 배지) — snake_case.
 *    status_labels 병기 규칙은 화면① 계약 §3.3 정본을 공유 (lib/db/statusLabels.ts)
 *  - evaluation: 출력스키마 ver2 형태로 재조립된 평가 1건
 *    (근거에 dialogue_id 포함 → "점수 클릭 → 원문 점프"의 연결고리)
 *  - dialogues: 좌측 상담 원문 전체 (turn_order 순)
 *  - review: 검수 블록 (★계약 v1.1 §3.4 — 검수 없으면 null. 정본 형태는
 *    검수_쓰기_API계약_v1.md §3.1. 화면 표시값 = COALESCE(review.effective, AI 원본))
 */
import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { computeStatusLabels, DEFAULT_LOW_SCORE_CUT } from '@/lib/db/statusLabels';

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

    // header 블록 (계약 §3.1) — 상담사명은 명부(agents), 라벨 병기는 조회 시점 컷으로 계산
    const agentId: string = consultation?.agent_id ?? 'unknown';
    const agent = await db.agents.getAgent(agentId);
    const cut = await db.config.getNumber('low_score_cut', DEFAULT_LOW_SCORE_CUT);
    const header = {
      consultation_code: evaluation.상담ID,
      agent_id: agentId,
      agent_name: agent?.agent_name ?? (agentId === 'unknown' ? '미배정' : agentId),
      consulted_at: consultation?.consulted_at ?? null,
      consult_type: evaluation.분류?.상담유형 ?? null,
      audio_url: consultation?.audio_url ?? null,
      risk_flagged: Boolean(evaluation.집계?.위험표시여부),
      status_labels: computeStatusLabels(
        evaluation.집계?.상태라벨,
        Number(evaluation.집계?.환산총점),
        cut,
      ),
    };

    // review 블록 (★v1.1) — 검수 없으면 null (기존 3블록 소비 코드는 무영향)
    const review = await db.reviews.getReview(evaluationId);

    return NextResponse.json({ header, evaluation, dialogues, review });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
