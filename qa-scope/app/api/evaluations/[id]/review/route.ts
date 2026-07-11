/**
 * app/api/evaluations/[id]/review/route.ts — 검수(리뷰) 쓰기
 *
 * 정본 계약: docs/api/검수_쓰기_API계약_v1.md (2026-07-10 확정)
 *  - PUT: 검수 업서트 (멱등 — 없으면 생성, 있으면 갱신. '확정→검수중' 되돌림 허용)
 *  - DELETE: 검수 철회 (3-E '검수폐기' 보존 후 삭제 — reviewRepo가 처리)
 *
 * 검증 분담: 요청 본문의 형태(필수값·타입)는 여기서, overrides의 내용
 * (항목코드·4택 ENUM)은 reviewRepo.validateOverrides가 검사한다
 * (ReviewValidationError → 400). 유효 집계는 저장 시점에 리포가 재계산·물질화.
 */
import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { ReviewValidationError } from '@/lib/db/reviewRepo';

function parseEvaluationId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const evaluationId = parseEvaluationId(id);
    if (!evaluationId) {
      return NextResponse.json({ error: '잘못된 평가 ID' }, { status: 400 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: '요청 본문이 JSON이 아님' }, { status: 400 });
    }

    // 본문 형태 검증 (계약 §3.1 ②)
    const issues: string[] = [];
    if (body.review_status !== '검수중' && body.review_status !== '확정') {
      issues.push(`review_status 값 이상: ${body.review_status} ('검수중' 또는 '확정')`);
    }
    if (typeof body.reviewer !== 'string' || body.reviewer.trim() === '') {
      issues.push('reviewer 누락 — 필수값 (3-F NOT NULL)');
    }
    if (body.review_comment != null && typeof body.review_comment !== 'string') {
      issues.push('review_comment는 문자열 또는 null');
    }
    if (body.overrides != null && !Array.isArray(body.overrides)) {
      issues.push('overrides는 배열이어야 함');
    }
    if (issues.length > 0) {
      return NextResponse.json({ error: issues.join(' / ') }, { status: 400 });
    }

    const review = await db.reviews.upsertReview(evaluationId, {
      review_status: body.review_status,
      reviewer: body.reviewer.trim(),
      review_comment: body.review_comment ?? null,
      overrides: body.overrides ?? [],
    });
    if (!review) {
      return NextResponse.json({ error: '평가를 찾을 수 없음' }, { status: 404 });
    }
    return NextResponse.json({ review });
  } catch (err: any) {
    if (err instanceof ReviewValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const evaluationId = parseEvaluationId(id);
    if (!evaluationId) {
      return NextResponse.json({ error: '잘못된 평가 ID' }, { status: 400 });
    }

    const deleted = await db.reviews.deleteReview(evaluationId);
    if (!deleted) {
      return NextResponse.json({ error: '검수를 찾을 수 없음' }, { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
