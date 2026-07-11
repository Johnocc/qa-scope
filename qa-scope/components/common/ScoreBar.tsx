/** rate: null이면 "평가 상황 없음"(N/A)이지 0점이 아니므로 "—"로 표시하고 막대를 채우지 않는다. */
export default function ScoreBar({ rate }: { rate: number | null }) {
  if (rate === null) {
    return <span className="text-gray-400 text-sm">—</span>;
  }
  const color = rate < 60 ? 'bg-red-500' : rate < 80 ? 'bg-amber-500' : 'bg-green-500';
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 rounded bg-gray-200 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, rate))}%` }} />
      </div>
      <span className="text-sm tabular-nums w-12 text-right">{rate.toFixed(1)}</span>
    </div>
  );
}
