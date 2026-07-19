'use client';

import { useState } from 'react';
import type { ReviewHistoryEntry } from '@/lib/types/evaluation';

/**
 * components/evaluation-detail/ReviewHistoryList.tsx — 검수 이력 나열.
 * 기본 접힘(컴팩트 1줄 헤더), 클릭 시 펼침. history가 없으면 아무것도
 * 렌더링하지 않는다(AudioPlayer와 동일 설계). 정렬은 API가 이미
 * version_no DESC로 내려주므로 배열 순서 그대로 렌더.
 */
function formatHistoryTime(createdAt: string): string {
  // created_at은 pool.ts dateStrings:true로 'YYYY-MM-DD HH:MM:SS' 문자열 —
  // Date 파싱 없이 슬라이스만으로 'MM-DD HH:mm' 추출
  return createdAt.slice(5, 16);
}

export default function ReviewHistoryList({ history }: { history: ReviewHistoryEntry[] }) {
  const [open, setOpen] = useState(false);

  if (history.length === 0) return null;

  return (
    <div className="border-t border-border bg-surface-card px-6 py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 py-1.5 text-xs font-medium text-sub hover:text-ink"
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>검수 이력 ({history.length})</span>
      </button>

      {open && (
        <div className="pb-1">
          {history.map((h) => (
            <div
              key={h.history_id}
              className="flex items-center gap-2 border-b border-border-subtle py-1.5 text-xs last:border-b-0"
            >
              <span className="shrink-0 font-medium">
                ver{h.version_no} · {h.snapshot.review_status} · {h.snapshot.reviewer} ·{' '}
                {formatHistoryTime(h.created_at)}
              </span>
              {h.snapshot.review_comment && (
                <span className="min-w-0 flex-1 truncate text-sub">{h.snapshot.review_comment}</span>
              )}
              {h.snapshot.overrides.length > 0 && (
                <span className="shrink-0 rounded-pill bg-surface-muted px-2 py-0.5 text-sub">
                  수정 {h.snapshot.overrides.length}건
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
