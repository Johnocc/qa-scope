import type { DialogueTurn } from '@/lib/types/evaluation';

function formatOffset(sec: number | null): string {
  if (sec === null) return '--:--';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * 각 발화에 id="d-{dialogue_id}"를 달아두면, 우측 항목 패널의 "근거 발화
 * 보기" 링크(#d-{dialogue_id})를 클릭했을 때 브라우저가 그 지점으로 스크롤
 * 하고, globals.css의 `:target` 규칙이 하이라이트한다 — 클라이언트 JS 없이
 * "항목 클릭 → 원문 점프"(계약 §4)를 구현.
 */
export default function DialogueList({ dialogues }: { dialogues: DialogueTurn[] }) {
  if (dialogues.length === 0) {
    return <div className="p-4 text-sm text-gray-400">상담 원문이 없습니다.</div>;
  }

  return (
    <div className="divide-y divide-gray-100">
      {dialogues.map((d) => (
        <div
          id={`d-${d.dialogue_id}`}
          key={d.dialogue_id}
          className={`px-4 py-2 text-sm scroll-mt-4 ${d.speaker === '고객' ? 'bg-gray-50' : ''}`}
        >
          <div className="text-xs text-gray-400 mb-0.5">
            [{formatOffset(d.offset_sec)}] {d.speaker}
          </div>
          <div>{d.content}</div>
        </div>
      ))}
    </div>
  );
}
