import type { ImprovementItem } from '@/lib/types/agent';

export default function ImprovementItems({ items }: { items: ImprovementItem[] }) {
  if (items.length === 0) {
    return <div className="px-4 py-6 text-sm text-gray-500 text-center">개선 필요 항목 없음 🎉</div>;
  }
  return (
    <div className="px-4 py-3 space-y-3">
      {items.map((it) => (
        <div key={it.item_code} className="border border-amber-200 bg-amber-50 rounded p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">
              {it.item_code}. {it.item_name}
            </span>
            <span className="text-sm tabular-nums text-amber-700 shrink-0">{it.rate.toFixed(1)}%</span>
          </div>
          {it.tip && <p className="text-xs text-gray-600 mt-1">{it.tip}</p>}
        </div>
      ))}
    </div>
  );
}
