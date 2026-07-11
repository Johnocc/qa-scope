import type { ImprovementItem } from '@/lib/types/agent';

export default function ImprovementItems({ items }: { items: ImprovementItem[] }) {
  if (items.length === 0) {
    return <div className="px-4 py-6 text-center text-sm text-sub">개선 필요 항목 없음</div>;
  }
  return (
    <div className="space-y-3 px-4 py-3">
      {items.map((it) => (
        <div key={it.item_code} className="rounded-control border border-warn-border bg-warn-bg p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">
              {it.item_code}. {it.item_name}
            </span>
            <span className="shrink-0 text-sm tabular-nums text-warn-text">{it.rate.toFixed(1)}%</span>
          </div>
          {it.tip && <p className="mt-1 text-xs text-sub">{it.tip}</p>}
        </div>
      ))}
    </div>
  );
}
