'use client';

/**
 * components/admin/PolicyDocumentManager.tsx — 약관 문서 업로드·재색인 관리.
 * POST /api/admin/policy-documents로 업로드(색인 후 컬렉션 전환), 성공 시
 * GET으로 목록을 재조회한다 (CutForm·TipsEditor와 동일한 fetch 관례).
 */
import { useRef, useState } from 'react';

interface PolicyDocumentItem {
  id: number;
  filename: string;
  collection_name: string;
  chunk_count: number;
  created_at: string;
  content_length: number;
}

interface Props {
  initialItems: PolicyDocumentItem[];
  initialActiveCollectionName: string;
}

export default function PolicyDocumentManager({ initialItems, initialActiveCollectionName }: Props) {
  const [items, setItems] = useState(initialItems);
  const [activeCollectionName, setActiveCollectionName] = useState(initialActiveCollectionName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refreshList() {
    const res = await fetch('/api/admin/policy-documents');
    const body = await res.json().catch(() => null);
    if (!res.ok || !body) {
      setError('목록 갱신 실패 — 페이지를 새로고침하세요');
      return;
    }
    setItems(body.items);
    setActiveCollectionName(body.active_collection_name);
  }

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError('파일을 선택하세요');
      return;
    }

    setBusy(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/admin/policy-documents', {
        method: 'POST',
        body: formData,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.message ?? '업로드에 실패했습니다');
        return;
      }

      setSuccessMessage(`약관 등록 완료 (조항 ${body.chunk_count}개 인식) — 지금부터 채점에 적용됩니다`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await refreshList();
    } catch {
      setError('업로드에 실패했습니다');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-card border border-border bg-surface-card p-6">
        <div className="text-sm text-sub">약관 업로드</div>
        <p className="mt-1 text-sm text-sub">
          약관 파일(.md, .txt)을 업로드하면 즉시 반영되어 이후 채점부터 새 약관이 적용됩니다.
        </p>

        <div className="mt-4 flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.txt"
            disabled={busy}
            onChange={() => {
              setError(null);
              setSuccessMessage(null);
            }}
            className="flex-1 text-sm text-sub file:mr-3 file:rounded-control file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink disabled:opacity-50"
          />
          <button
            onClick={handleUpload}
            disabled={busy}
            className="rounded-control bg-primary px-4 py-1.5 text-sm font-medium text-ink-inverse transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {busy ? '문서 처리 중입니다 (약 30초 소요)…' : '업로드'}
          </button>
        </div>

        {successMessage && <p className="mt-2 text-xs text-ok-text">{successMessage}</p>}
        {error && <p className="mt-2 text-xs text-danger-text">{error}</p>}
      </div>

      <div className="rounded-card border border-border bg-surface-card p-6">
        <div className="text-sm text-sub">업로드 이력</div>
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-xs text-sub">
              <th className="pb-2 font-medium">파일명</th>
              <th className="pb-2 font-medium">인식된 조항</th>
              <th className="pb-2 font-medium">업로드 일시</th>
              <th className="pb-2 font-medium">상태</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-border-subtle last:border-b-0">
                <td className="py-2 text-ink">{item.filename}</td>
                <td className="py-2 tabular-nums text-ink">{item.chunk_count}</td>
                <td className="py-2 tabular-nums text-sub">{item.created_at}</td>
                <td className="py-2">
                  {item.collection_name === activeCollectionName && (
                    <span className="rounded-pill bg-ok-text/10 px-2 py-0.5 text-xs font-medium text-ok-text">
                      현재 적용
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-sub">
                  업로드 이력이 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
