'use client';

/**
 * components/admin/CutForm.tsx — 저점수 컷 편집 폼.
 * PUT /api/admin/config로 low_score_cut을 저장한다 (proxy.ts가 ADMIN만 통과시킴).
 */
import { useState } from 'react';

export default function CutForm({ initialCut }: { initialCut: number | null }) {
  const [current, setCurrent] = useState(initialCut);
  const [input, setInput] = useState(initialCut !== null ? String(initialCut) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaved(false);
    setError(null);

    const trimmed = input.trim();
    const value = Number(trimmed);
    if (trimmed === '' || !Number.isFinite(value) || value < 0 || value > 100) {
      setError('컷은 0~100 사이 숫자여야 합니다');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ low_score_cut: value }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.message ?? '저장에 실패했습니다');
        return;
      }
      setCurrent(body.low_score_cut);
      setSaved(true);
    } catch {
      setError('저장에 실패했습니다');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card border border-border bg-surface-card p-6">
      <div className="text-sm text-sub">저점수 컷</div>
      <div className="mt-1 text-4xl font-bold tabular-nums">
        {current !== null ? `${current}점` : '미설정'}
      </div>
      <p className="mt-2 text-sm text-sub">
        이 점수 미만은 '저점수'로 분류됩니다. 저장 즉시 전체 채점 판정에 반영됩니다.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <input
          type="number"
          min={0}
          max={100}
          step="any"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setSaved(false);
          }}
          disabled={busy}
          className="w-24 rounded-control border border-border bg-surface-card px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ink/20 disabled:bg-surface-muted disabled:text-sub"
        />
        <button
          onClick={handleSave}
          disabled={busy}
          className="rounded-control bg-primary px-4 py-1.5 text-sm font-medium text-ink-inverse transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {busy ? '저장 중...' : '저장'}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-danger-text">{error}</p>}
      {saved && !error && <p className="mt-2 text-xs text-ok-text">저장되었습니다</p>}
    </div>
  );
}
