'use client';

/**
 * components/evaluations/UploadPanel.tsx — 화면① 상단 "새 상담 업로드" 토글 +
 * 모달(중앙 오버레이). UploadForm은 상태를 스스로 관리하므로 여기서는
 * busy(닫기 비활성 판단)와 open(모달 표시)만 다룬다.
 *
 * 트리거 버튼은 FilterBar의 children으로 전달돼 그 <form method="get"> 안에
 * 들어간다. 모달 오버레이(그 안의 UploadForm <form>)까지 같이 들어가면
 * <form> 중첩(HTML에서 무효 — form은 form을 자식으로 못 가짐)이 발생하므로,
 * createPortal로 document.body에 직접 그려 DOM상 그 form 바깥으로 뺀다.
 *
 * 닫기 경로 3가지(X 버튼 / 배경 클릭 / 결과 확인 버튼)는 전부 handleClose로
 * 모인다 — 채점 결과가 있는 상태로 닫히면(hasResult) router.refresh()로
 * 화면① 목록을 갱신하고, 결과 없이 닫히면(취소) 그냥 닫기만 한다.
 * busy(채점 진행 중)면 X·배경 클릭 모두 무시 — 진행 중 이탈 방지.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import UploadForm, { type AgentOption } from './UploadForm';

export default function UploadPanel({ agents }: { agents: AgentOption[] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hasResult, setHasResult] = useState(false);
  const router = useRouter();

  function openModal() {
    setOpen(true);
    setBusy(false);
    setHasResult(false);
  }

  function handleClose() {
    if (busy) return; // 진행 중 이탈 방지
    if (hasResult) router.refresh();
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="ml-auto rounded-control border border-border bg-surface-card px-4 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-surface-hover"
      >
        새 상담 업로드
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
            onClick={handleClose}
          >
            <div
              className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-card bg-surface-card p-6 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold text-ink">새 상담 업로드</h3>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={busy}
                  aria-label="닫기"
                  className="text-lg leading-none text-sub hover:text-ink disabled:opacity-30"
                >
                  ✕
                </button>
              </div>
              <UploadForm
                agents={agents}
                onBusyChange={setBusy}
                onResult={() => setHasResult(true)}
                onClose={handleClose}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
