/** rate: null이면 "평가 상황 없음"(N/A)이지 0점이 아니므로 "—"로 표시하고 막대를 채우지 않는다. */
export default function ScoreBar({ rate }: { rate: number | null }) {
  if (rate === null) {
    return <span className="text-sm text-sub">—</span>;
  }
  const color = rate < 60 ? 'bg-danger-text' : rate < 80 ? 'bg-warn-text' : 'bg-ok-text';
  return (
    <div className="flex min-w-[120px] items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-muted">
        <div className={`h-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, rate))}%` }} />
      </div>
      <span className="w-12 text-right text-sm tabular-nums">{rate.toFixed(1)}</span>
    </div>
  );
}
