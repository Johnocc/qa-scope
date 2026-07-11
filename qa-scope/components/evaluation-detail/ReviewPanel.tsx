'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { putReview, deleteReview } from '@/lib/api/evaluations';
import type { Review } from '@/lib/types/evaluation';

/**
 * 검수확정·코멘트 (CLAUDE.md §9 화면② 하단). v0 범위만 — 항목별 점수수정
 * (overrides)은 연기 v1 범위라 UI 없음 (검수_쓰기_API계약_v1.md §1 결정 1).
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
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? '저장 실패');
    } finally {
      setPending(null);
    }
  }

  async function withdraw() {
    setPending('withdraw');
    setError(null);
    try {
      await deleteReview(evaluationId);
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? '철회 실패');
    } finally {
      setPending(null);
    }
  }

  const busy = pending !== null;

  return (
    <div className="px-6 py-4 border-t border-gray-200 bg-white">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">검수</h3>
        {review && (
          <span
            className={`text-xs px-2 py-0.5 rounded ${
              review.review_status === '확정'
                ? 'bg-green-100 text-green-700'
                : 'bg-amber-100 text-amber-700'
            }`}
          >
            {review.review_status}
          </span>
        )}
      </div>

      {review && review.overrides.length > 0 && (
        <div className="text-xs text-gray-500 mb-2">
          점수 수정: {review.overrides.map((o) => `${o.item_code}(${o.level_original}→${o.level_override})`).join(', ')}
        </div>
      )}

      <div className="flex gap-3 items-start flex-wrap">
        <input
          type="text"
          placeholder="검수자 이름"
          value={reviewer}
          onChange={(e) => setReviewer(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1 text-sm w-32"
        />
        <textarea
          placeholder="코멘트"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          className="border border-gray-300 rounded px-2 py-1 text-sm flex-1 min-w-[200px]"
        />
        <div className="flex gap-2">
          <button
            onClick={() => submit('검수중')}
            disabled={busy}
            className="text-sm px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
          >
            {pending === 'save' ? '저장 중...' : '검수 저장'}
          </button>
          <button
            onClick={() => submit('확정')}
            disabled={busy}
            className="text-sm px-3 py-1.5 rounded bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {pending === 'confirm' ? '확정 중...' : '검수확정'}
          </button>
          {review && (
            <button
              onClick={withdraw}
              disabled={busy}
              className="text-sm px-3 py-1.5 rounded text-red-600 hover:underline disabled:opacity-50"
            >
              {pending === 'withdraw' ? '철회 중...' : '검수 철회'}
            </button>
          )}
        </div>
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
