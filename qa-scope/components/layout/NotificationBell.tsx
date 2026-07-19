'use client';

/**
 * components/layout/NotificationBell.tsx — 헤더 알림 벨 (★v9)
 *
 * 알림(불완전판매 의심 건)을 30초 폴링으로 가져와 배지·드롭다운으로 보여준다.
 * 실시간(WebSocket/SSE)은 쓰지 않는다 — 폴링으로 충분(팀 결정 2026-07-20).
 *
 * 읽음/삭제 모델:
 *  - 항목 클릭 → (미읽음이면) 읽음 처리 후 채점 상세(/evaluations/[id])로 이동.
 *    읽은 알림은 목록에서 사라지지 않고 회색으로 남아 재확인할 수 있다.
 *  - 항목별 X 버튼 → 개별 삭제. 하단 '읽은 알림 삭제' → 읽은 것만 일괄 삭제.
 *  - 읽음·삭제 상태는 전 계정 공유(단일 매니저 시연 전제) — 계정별 분리는
 *    다중 매니저 도입 시 별도 작업.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const POLL_INTERVAL_MS = 30_000;

interface NotificationItem {
  notification_id: number;
  evaluation_id: number;
  message: string;
  is_read: 0 | 1;
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

  const unreadCount = items.filter((n) => !n.is_read).length;
  const readCount = items.length - unreadCount;

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return; // 401(세션 만료)·500 — 다음 폴링에서 재시도
      const data = await res.json();
      if (Array.isArray(data.notifications)) setItems(data.notifications);
    } catch {
      // 네트워크 일시 오류 — 다음 폴링에서 재시도 (목록은 마지막 성공값 유지)
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
    if (!item.is_read) {
      // 읽음 처리 실패해도 이동은 진행 — 미읽음으로 남아 다음 폴링에 다시 보인다.
      try {
        await fetch(`/api/notifications/${item.notification_id}`, { method: 'PATCH' });
      } catch {
        /* 무시 — 위 주석 참조 */
      }
      setItems((prev) =>
        prev.map((n) =>
          n.notification_id === item.notification_id ? { ...n, is_read: 1 } : n,
        ),
      );
    }
    setOpen(false);
    router.push(`/evaluations/${item.evaluation_id}`);
  };

  const handleDeleteItem = async (item: NotificationItem) => {
    try {
      const res = await fetch(`/api/notifications/${item.notification_id}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 404) return; // 실패 시 목록 유지(다음 폴링이 정본)
    } catch {
      return;
    }
    setItems((prev) => prev.filter((n) => n.notification_id !== item.notification_id));
  };

  const handleDeleteRead = async () => {
    try {
      const res = await fetch('/api/notifications', { method: 'DELETE' });
      if (!res.ok) return;
    } catch {
      return;
    }
    setItems((prev) => prev.filter((n) => !n.is_read));
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`알림 — 미읽음 ${unreadCount}건`}
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
        {unreadCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-chart-danger px-1 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-control border border-border bg-surface-card shadow-lg">
          <div className="border-b border-border px-3 py-2 text-xs font-medium text-sub">
            알림 {items.length}건 · 미읽음 {unreadCount}건
          </div>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-sub">알림이 없습니다</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {items.map((item) => (
                <li
                  key={item.notification_id}
                  className="flex items-start border-b border-border last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className="min-w-0 flex-1 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
                  >
                    <span className="flex items-start gap-1.5">
                      {!item.is_read && (
                        <span
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-chart-danger"
                          aria-hidden="true"
                        />
                      )}
                      <span
                        className={`block text-sm ${item.is_read ? 'text-sub' : 'text-ink'}`}
                      >
                        {item.message}
                      </span>
                    </span>
                    <span
                      className={`mt-0.5 block text-xs ${item.is_read ? 'text-sub/70' : 'text-sub'} ${item.is_read ? '' : 'pl-3'}`}
                    >
                      {formatTime(item.created_at)}
                      {item.is_read ? ' · 읽음' : ''}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(item)}
                    aria-label="알림 삭제"
                    title="알림 삭제"
                    className="shrink-0 px-2 py-2.5 text-sub transition-colors hover:text-ink"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {readCount > 0 && (
            <div className="border-t border-border px-3 py-2 text-right">
              <button
                type="button"
                onClick={handleDeleteRead}
                className="text-xs text-sub transition-colors hover:text-ink"
              >
                읽은 알림 삭제 ({readCount})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
