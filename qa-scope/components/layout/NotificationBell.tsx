'use client';

/**
 * components/layout/NotificationBell.tsx — 헤더 알림 벨 (★v9)
 *
 * 미읽음 알림(불완전판매 의심 건)을 30초 폴링으로 가져와 배지·드롭다운으로
 * 보여준다. 항목 클릭 → 읽음 처리(PATCH) 후 해당 채점 상세(/evaluations/[id])로
 * 이동. 실시간(WebSocket/SSE)은 쓰지 않는다 — 폴링으로 충분(팀 결정 2026-07-20).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const POLL_INTERVAL_MS = 30_000;

interface NotificationItem {
  notification_id: number;
  evaluation_id: number;
  message: string;
  created_at: string; // 'YYYY-MM-DD HH:MM:SS' (KST 벽시계 — pool dateStrings)
}

/** 'YYYY-MM-DD HH:MM:SS' → 'MM-DD HH:MM' — 문자열 슬라이스라 타임존 변환 없음 */
function formatTime(createdAt: string): string {
  return createdAt.slice(5, 16);
}

export default function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return; // 401(세션 만료)·500 — 다음 폴링에서 재시도
      const data = await res.json();
      if (Array.isArray(data.notifications)) setItems(data.notifications);
    } catch {
      // 네트워크 일시 오류 — 다음 폴링에서 재시도 (배지는 마지막 성공값 유지)
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // 드롭다운 바깥 클릭으로 닫기
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const handleItemClick = async (item: NotificationItem) => {
    // 읽음 처리 실패해도 이동은 진행 — 미읽음으로 남아 다음 폴링에 다시 보인다.
    try {
      await fetch(`/api/notifications/${item.notification_id}`, { method: 'PATCH' });
    } catch {
      /* 무시 — 위 주석 참조 */
    }
    setItems((prev) => prev.filter((n) => n.notification_id !== item.notification_id));
    setOpen(false);
    router.push(`/evaluations/${item.evaluation_id}`);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`알림 ${items.length}건`}
        className="relative rounded-control border border-border p-1.5 text-sub transition-colors hover:bg-surface-hover hover:text-ink"
      >
        {/* 벨 아이콘 (인라인 SVG — 외부 의존성 없음) */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {items.length > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-chart-danger px-1 text-[10px] font-semibold leading-none text-white">
            {items.length > 99 ? '99+' : items.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-control border border-border bg-surface-card shadow-lg">
          <div className="border-b border-border px-3 py-2 text-xs font-medium text-sub">
            미읽음 알림 {items.length}건
          </div>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-sub">새 알림이 없습니다</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {items.map((item) => (
                <li key={item.notification_id} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className="block w-full px-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
                  >
                    <span className="block text-sm text-ink">{item.message}</span>
                    <span className="mt-0.5 block text-xs text-sub">{formatTime(item.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
