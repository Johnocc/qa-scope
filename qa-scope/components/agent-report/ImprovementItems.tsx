import type { ImprovementItem } from '@/lib/types/agent';

/**
 * totalCount(전체 개선대상 수)가 표시된 개수보다 많으면 "외 N건 더"로 잘림을 알린다
 * (팀장 UI 컨펌 피드백 B). 안내는 항목별 상세로 유도한다 — 거기서 '외 N건'의 코칭 팁까지 확인 가능(v1.5).
 *   - onSeeMore 있음(웹 요약 탭): 버튼으로 '항목별 달성률' 탭 전환 (같은 페이지 내 탭이라 앵커가 안 먹힘)
 *   - onSeeMore 없음(PDF 등 단일 긴 페이지): 아래 항목별 상세로 스크롤하는 앵커 링크
 */
export default function ImprovementItems({
  items,
  totalCount,
  onSeeMore,
}: {
  items: ImprovementItem[];
  totalCount: number;
  onSeeMore?: () => void;
}) {
  if (items.length === 0) {
    return <div className="px-4 py-6 text-center text-sm text-sub">개선 필요 항목 없음</div>;
  }
  const remaining = totalCount - items.length;
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
      {remaining > 0 && (
        <p className="text-center text-xs text-sub">
          {onSeeMore ? (
            <button
              type="button"
              onClick={onSeeMore}
              className="underline decoration-sub underline-offset-4 hover:text-ink hover:decoration-ink"
            >
              외 {remaining}건 — 항목별 달성률에서 확인
            </button>
          ) : (
            <a href="#item-detail" className="underline decoration-sub underline-offset-4 hover:text-ink hover:decoration-ink">
              외 {remaining}건 — 아래 항목별 상세에서 확인
            </a>
          )}
        </p>
      )}
    </div>
  );
}
