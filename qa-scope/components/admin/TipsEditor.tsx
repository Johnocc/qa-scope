'use client';

/**
 * components/admin/TipsEditor.tsx — 코칭 팁 항목별 편집 폼.
 * 항목마다 독립적으로 PUT /api/admin/coaching-tips 호출 (CutForm.tsx와 동일 관례).
 */
import { useState } from 'react';
import { ITEM_NAMES, type ItemCode } from '@/lib/constants/rubric';

interface Tip {
  item_code: string;
  tip_text: string;
  updated_at: string;
}

interface RowState {
  text: string;
  busy: boolean;
  error: string | null;
  saved: boolean;
}

export default function TipsEditor({ initialTips }: { initialTips: Tip[] }) {
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {};
    for (const t of initialTips) {
      init[t.item_code] = { text: t.tip_text, busy: false, error: null, saved: false };
    }
    return init;
  });

  function patchRow(code: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [code]: { ...prev[code], ...patch } }));
  }

  async function handleSave(code: string) {
    const row = rows[code];
    const trimmed = row.text.trim();
    if (trimmed === '') {
      patchRow(code, { error: '문구를 입력하세요', saved: false });
      return;
    }

    patchRow(code, { busy: true, error: null, saved: false });
    try {
      const res = await fetch('/api/admin/coaching-tips', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_code: code, tip_text: row.text }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        patchRow(code, { busy: false, error: body?.message ?? '저장에 실패했습니다' });
        return;
      }
      patchRow(code, { busy: false, text: body.tip_text, saved: true });
    } catch {
      patchRow(code, { busy: false, error: '저장에 실패했습니다' });
    }
  }

  return (
    <div className="rounded-card border border-border bg-surface-card p-6">
      <div className="space-y-4">
        {initialTips.map((t) => {
          const row = rows[t.item_code];
          return (
            <div key={t.item_code} className="border-b border-border-subtle pb-4 last:border-b-0 last:pb-0">
              <div className="mb-1.5 text-sm font-medium text-ink">
                {t.item_code} {ITEM_NAMES[t.item_code as ItemCode]}
              </div>
              <div className="flex items-start gap-3">
                <textarea
                  value={row.text}
                  onChange={(e) => patchRow(t.item_code, { text: e.target.value, saved: false })}
                  disabled={row.busy}
                  rows={2}
                  className="min-w-[200px] flex-1 rounded-control border border-border bg-surface-card px-2 py-1.5 text-sm placeholder:text-sub/60 focus:outline-none focus:ring-2 focus:ring-ink/20 disabled:bg-surface-muted disabled:text-sub"
                />
                <button
                  onClick={() => handleSave(t.item_code)}
                  disabled={row.busy}
                  className="rounded-control bg-primary px-4 py-1.5 text-sm font-medium text-ink-inverse transition-colors hover:bg-primary-hover disabled:opacity-50"
                >
                  {row.busy ? '저장 중...' : '저장'}
                </button>
              </div>
              {row.error && <p className="mt-1 text-xs text-danger-text">{row.error}</p>}
              {row.saved && !row.error && <p className="mt-1 text-xs text-ok-text">저장되었습니다</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
