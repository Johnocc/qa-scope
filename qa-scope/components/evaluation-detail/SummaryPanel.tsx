import { ITEM_NAMES, type ItemCode } from '@/lib/constants/rubric';
import type { EvaluationItemScore } from '@/lib/types/evaluation';
import StatusBadge from '@/components/common/StatusBadge';

interface SummaryPanelProps {
  items: EvaluationItemScore[];
  score: number;
  labels: string[];
}

export default function SummaryPanel({ items, score, labels }: SummaryPanelProps) {
  return (
    <div className="mb-4 rounded-card border border-border bg-surface-card px-6 py-5">
      <div className="flex gap-8">
        <div className="shrink-0">
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold tabular-nums">{score.toFixed(1)}</span>
            <span className="text-sub"> / 100</span>
          </div>
          <div className="mt-2">
            <StatusBadge labels={labels} />
          </div>
        </div>
        <div className="flex-1 space-y-0.5">
          {items.map((it) => {
            const isNA = it.충족수준 === '해당없음';
            const isFail = it.충족수준 === '미충족';
            return (
              <a
                key={it.항목코드}
                href={`#item-${it.항목코드}`}
                className="flex items-center gap-3 rounded-control px-2 py-1 hover:bg-surface-hover"
              >
                <span
                  className={`w-44 shrink-0 truncate text-xs ${isNA ? 'text-sub' : ''}`}
                >
                  {ITEM_NAMES[it.항목코드 as ItemCode]}
                </span>
                {isNA ? (
                  <span className="flex-1 text-sm text-sub">—</span>
                ) : (
                  <div className="h-1 flex-1 overflow-hidden rounded-pill bg-surface-muted">
                    {isFail ? (
                      <div
                        className="h-full"
                        style={{
                          width: '100%',
                          backgroundColor: 'color-mix(in srgb, var(--chart-danger) 35%, transparent)',
                        }}
                      />
                    ) : (
                      <div
                        className="h-full bg-chart-primary"
                        style={{ width: `${(it.획득점수 / it.배점) * 100}%` }}
                      />
                    )}
                  </div>
                )}
                <span className={`w-12 shrink-0 text-right text-xs tabular-nums ${isNA ? 'text-sub' : ''}`}>
                  {it.획득점수}/{it.배점}
                </span>
              </a>
            );
          })}
        </div>
      </div>
      <p className="mt-3 text-xs text-sub">항목을 클릭하면 아래 상세 평가로 이동합니다</p>
    </div>
  );
}
