'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { putReview, deleteReview } from '@/lib/api/evaluations';
import type { Review } from '@/lib/types/evaluation';

/**
 * 검수 3상태 UI (검수개정안 v2): 미검수(review=null) / 검수중 / 확정.
 * 상태는 서버가 내려준 review_status로만 판정한다 — 프론트가 추정하지 않는다.
 * 확정 상태는 입력란을 잠근다: 고치려면 철회가 먼저다. 확정 철회는 재채점
 * 스킵 보호가 풀리는 행위라 2차 확인을 거친다 (검수_쓰기_API계약_v1.md 결정 3).
 *
 * v0 범위만 — 항목별 점수수정(overrides)은 연기 v1 범위라 UI 없음 (계약 §1 결정 1).
 * 저장/철회 성공 시 router.refresh()로 서버 컴포넌트가 review·COALESCE된
 * 표시값을 다시 그리게 한다.
 */
export default function ReviewPanel({
  evaluationId,
  review,
}: {
  evaluationId: number;
  review: Review | null;
}) {
  const router = useRouter();
  const [reviewer, setReviewer] = useState(review?.reviewer ?? '');
  const [comment, setComment] = useState(review?.review_comment ?? '');
  const [pending, setPending] = useState<'save' | 'confirm' | 'withdraw' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justConfirmed, setJustConfirmed] = useState(false);

  const state = review === null ? '미검수' : review.review_status;
  const locked = state === '확정';
  const busy = pending !== null;

  async function submit(status: '검수중' | '확정') {
    if (!reviewer.trim()) {
      setError('검수자 이름을 입력해주세요.');
      return;
    }
    setPending(status === '확정' ? 'confirm' : 'save');
    setError(null);
    try {
      await putReview(evaluationId, {
        review_status: status,
        reviewer: reviewer.trim(),
        review_comment: comment.trim() || null,
      });
      setJustConfirmed(status === '확정');
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? '저장 실패');
    } finally {
      setPending(null);
    }
  }

  async function withdraw() {
    // 확정 철회는 재채점 스킵 보호가 풀리는 행위라 2차 확인 (검수중 철회는 그 보호가
    // 애초에 없어 확인 없이 바로 실행 — 계약 결정 3-A 배경 그대로).
    if (state === '확정' && !window.confirm('확정을 철회하면 재채점 대상이 됩니다. 철회하시겠습니까?')) {
      return;
    }
    setPending('withdraw');
    setError(null);
    try {
      await deleteReview(evaluationId);
      setJustConfirmed(false);
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? '철회 실패');
    } finally {
      setPending(null);
    }
  }

  const BADGE_STYLE: Record<typeof state, string> = {
    미검수: 'bg-na-bg text-na-text',
    검수중: 'bg-warn-bg text-warn-text',
    확정: 'bg-ok-bg text-ok-text',
  };
  const badgeLabel = state === '검수중' ? `검수중 · ${review!.reviewer}` : state === '확정' ? '확정 ✓' : '미검수';

  return (
    <div className="border-t border-border bg-surface-card px-6 py-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium">검수</h3>
        <span className={`rounded-pill px-2.5 py-0.5 text-xs font-medium ${BADGE_STYLE[state]}`}>
          {badgeLabel}
        </span>
      </div>

      {review && review.overrides.length > 0 && (
        <div className="mb-2 text-xs text-sub">
          점수 수정: {review.overrides.map((o) => `${o.item_code}(${o.level_original}→${o.level_override})`).join(', ')}
        </div>
      )}

      {locked && (
        <p className="mb-2 text-xs text-sub">확정된 검수입니다. 내용을 고치려면 먼저 철회하세요.</p>
      )}

      <div className="flex flex-wrap items-start gap-3">
        <input
          type="text"
          placeholder="검수자 이름"
          value={reviewer}
          onChange={(e) => setReviewer(e.target.value)}
          disabled={locked}
          readOnly={locked}
          className="w-32 rounded-control border border-border bg-surface-card px-2 py-1.5 text-sm placeholder:text-sub/60 focus:outline-none focus:ring-2 focus:ring-ink/20 disabled:bg-surface-muted disabled:text-sub"
        />
        <textarea
          placeholder="코멘트"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          disabled={locked}
          readOnly={locked}
          className="min-w-[200px] flex-1 rounded-control border border-border bg-surface-card px-2 py-1.5 text-sm placeholder:text-sub/60 focus:outline-none focus:ring-2 focus:ring-ink/20 disabled:bg-surface-muted disabled:text-sub"
        />
        <div className="flex gap-2">
          {!locked && (
            <>
              <button
                onClick={() => submit('검수중')}
                disabled={busy}
                className="rounded-control bg-surface-muted px-3 py-1.5 text-sm hover:bg-surface-hover disabled:opacity-50"
              >
                {pending === 'save' ? '저장 중...' : '검수 저장'}
              </button>
              <button
                onClick={() => submit('확정')}
                disabled={busy}
                className="rounded-control bg-ink px-3 py-1.5 text-sm text-ink-inverse hover:opacity-90 disabled:opacity-50"
              >
                {pending === 'confirm' ? '확정 중...' : '검수확정'}
              </button>
            </>
          )}
          {state !== '미검수' && (
            <button
              onClick={withdraw}
              disabled={busy}
              className="rounded-control px-3 py-1.5 text-sm text-danger-text hover:underline disabled:opacity-50"
            >
              {pending === 'withdraw' ? '철회 중...' : '검수 철회'}
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-danger-text">{error}</p>}

      {justConfirmed && (
        <div className="mt-3 flex items-center justify-between rounded-control border border-ok-border bg-ok-bg px-3 py-2 text-sm text-ok-text">
          <span>검수가 확정되었습니다.</span>
          <Link
            href="/evaluations"
            className="rounded-control bg-ok-bg px-2.5 py-1 text-sm font-medium text-ok-text underline decoration-ok-text underline-offset-4 hover:opacity-80"
          >
            목록으로 돌아가기
          </Link>
        </div>
      )}
    </div>
  );
}
