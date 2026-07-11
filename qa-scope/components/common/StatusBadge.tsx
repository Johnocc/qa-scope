/**
 * 상태라벨 병기 배지. status_labels는 항상 1~2개, 있으면 그대로 다 그린다
 * (병기 여부·순서는 서버가 결정 — CLAUDE.md §8.3, 화면① 계약 §3.3).
 */
const STYLE: Record<string, string> = {
  '불완전판매 의심': 'bg-red-100 text-red-700 border border-red-300',
  '저점수': 'bg-amber-100 text-amber-700 border border-amber-300',
  '정상': 'bg-green-100 text-green-700 border border-green-300',
};

export default function StatusBadge({ labels }: { labels: string[] }) {
  return (
    <span className="inline-flex gap-1">
      {labels.map((label) => (
        <span
          key={label}
          className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${STYLE[label] ?? 'bg-gray-100 text-gray-700 border border-gray-300'}`}
        >
          {label}
        </span>
      ))}
    </span>
  );
}
