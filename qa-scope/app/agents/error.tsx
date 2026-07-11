'use client';

import { ApiError } from '@/lib/api/client';

/**
 * /agents, /agents/[agentId]/report 세그먼트 에러 경계.
 * lib/api/agents.ts는 API 실패를 목업으로 덮지 않고 그대로 던진다 — 여기서 잡아
 * 화면에 명확히 드러낸다(조용한 폴백 금지).
 */
export default function AgentsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const status = error instanceof ApiError ? error.status : null;

  return (
    <div className="px-6 py-16 flex flex-col items-center text-center gap-3">
      <p className="text-sm font-semibold text-danger-text">
        상담사 데이터를 불러오지 못했습니다{status ? ` (HTTP ${status})` : ''}
      </p>
      <p className="text-sm text-sub max-w-md">{error.message || '알 수 없는 오류가 발생했습니다.'}</p>
      <p className="text-xs text-sub">
        DB(MySQL)가 켜져 있는지 확인해 주세요. 목업 데이터로 자동 대체되지 않습니다.
      </p>
      <button
        onClick={reset}
        className="mt-2 rounded-control border border-border bg-surface-card px-4 py-2 text-sm font-medium hover:bg-surface-hover"
      >
        다시 시도
      </button>
    </div>
  );
}
