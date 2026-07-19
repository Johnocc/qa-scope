'use client';

import type { DialogueTurn } from '@/lib/types/evaluation';

function formatOffset(sec: number | null): string {
  if (sec === null) return '--:--';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function seekTo(offsetSec: number) {
  const audio = document.getElementById('consultation-audio') as HTMLAudioElement | null;
  if (!audio) return; // 음성 미첨부 — 조용히 무동작
  audio.currentTime = offsetSec;
  audio.play();
}

/**
 * 각 발화에 id="d-{dialogue_id}"를 달아두면, 우측 항목 패널의 "근거 발화
 * 보기" 링크(#d-{dialogue_id})를 클릭했을 때 브라우저가 그 지점으로 스크롤
 * 하고, globals.css의 `:target .bubble` 규칙이 말풍선만 하이라이트한다 —
 * 클라이언트 JS 없이 "항목 클릭 → 원문 점프"(계약 §4)를 구현. id는 말풍선이
 * 아니라 최외곽 wrapper에 달아 :target이 선택되고, 하이라이트 자체는 그
 * 안의 .bubble 요소에 적용된다.
 */
export default function DialogueList({ dialogues }: { dialogues: DialogueTurn[] }) {
  if (dialogues.length === 0) {
    return <div className="p-4 text-sm text-sub">상담 원문이 없습니다.</div>;
  }

  return (
    <div className="space-y-3 p-4">
      {dialogues.map((d) => {
        const isCustomer = d.speaker === '고객';
        const bubble = (
          <div
            className={`bubble max-w-[75%] rounded-card border border-border px-3.5 py-2.5 text-sm ${
              isCustomer ? 'bg-surface-muted' : 'bg-surface-card'
            }`}
          >
            {d.content}
          </div>
        );
        const time =
          d.offset_sec !== null ? (
            <button
              type="button"
              onClick={() => seekTo(d.offset_sec!)}
              title="이 시점부터 재생"
              className="shrink-0 text-xs text-sub hover:text-ink hover:underline"
            >
              [{formatOffset(d.offset_sec)}]
            </button>
          ) : (
            <span className="shrink-0 text-xs text-sub">[{formatOffset(d.offset_sec)}]</span>
          );
        return (
          <div
            id={`d-${d.dialogue_id}`}
            key={d.dialogue_id}
            className={`scroll-mt-4 flex flex-col gap-0.5 px-1 py-1 ${isCustomer ? 'items-start' : 'items-end'}`}
          >
            <span className="text-xs text-sub">{d.speaker}</span>
            <div className={`flex w-full items-end gap-2 ${isCustomer ? 'justify-start' : 'justify-end'}`}>
              {isCustomer ? (
                <>
                  {bubble}
                  {time}
                </>
              ) : (
                <>
                  {time}
                  {bubble}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
