'use client';

/** 최상위 catch-all 에러 경계 — /evaluations, /agents 세그먼트 밖에서 실패했을 때만 뜬다. */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="px-6 py-16 flex flex-col items-center text-center gap-3">
      <p className="text-sm font-semibold text-danger-text">문제가 발생했습니다</p>
      <p className="text-sm text-sub max-w-md">{error.message || '알 수 없는 오류가 발생했습니다.'}</p>
      <button
        onClick={reset}
        className="mt-2 rounded-control border border-border bg-surface-card px-4 py-2 text-sm font-medium hover:bg-surface-hover"
      >
        다시 시도
      </button>
    </div>
  );
}
