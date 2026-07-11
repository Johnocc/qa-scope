/**
 * 상태라벨 병기 배지. status_labels는 항상 1~2개, 있으면 그대로 다 그린다
 * (병기 여부·순서는 서버가 결정 — CLAUDE.md §8.3, 화면① 계약 §3.3).
 */
const STYLE: Record<string, string> = {
  '불완전판매 의심': 'bg-danger-bg text-danger-text border border-danger-border',
  '저점수': 'bg-warn-bg text-warn-text border border-warn-border',
  '정상': 'bg-ok-bg text-ok-text border border-ok-border',
};

export default function StatusBadge({ labels }: { labels: string[] }) {
  return (
    <span className="inline-flex gap-1">
      {labels.map((label) => (
        <span
          key={label}
          className={`whitespace-nowrap rounded-pill px-2.5 py-0.5 text-xs font-medium ${STYLE[label] ?? 'bg-na-bg text-na-text'}`}
        >
          {label}
        </span>
      ))}
    </span>
  );
}
