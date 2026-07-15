import Link from 'next/link';
import { getAgentReport } from '@/lib/api/agents';
import type { Period } from '@/lib/types/agent';
import RadarChart from '@/components/agent-report/RadarChart';
import ItemDetailTable from '@/components/agent-report/ItemDetailTable';
import ImprovementItems from '@/components/agent-report/ImprovementItems';
import PdfDownloadButton from '@/components/agent-report/PdfDownloadButton';

const PERIODS: { value: Period; label: string }[] = [
  { value: '30d', label: '최근 30일' },
  { value: '90d', label: '최근 90일' },
  { value: 'all', label: '전체 기간' },
];

const PERIOD_FILE_LABEL: Record<string, string> = { '30d': '30일', '90d': '90일', all: '전체' };
function periodFileLabel(period: string): string {
  return PERIOD_FILE_LABEL[period] ?? period;
}

export default async function AgentReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ agentId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { agentId } = await params;
  const sp = await searchParams;
  const period: Period = (sp.period as Period) ?? '30d';
  const report = await getAgentReport(agentId, period);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface-card px-6 py-4">
        <Link href="/agents" className="text-sm text-sub hover:text-ink hover:underline">
          ← 대시보드로
        </Link>
        <h2 className="text-base font-semibold">{report.meta.agent_name}</h2>
        <span className="text-sm text-sub">
          {report.meta.period_from ?? ''} ~ {report.meta.period_to}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {PERIODS.map((p) => (
            <Link
              key={p.value}
              href={`/agents/${agentId}/report?period=${p.value}`}
              className={`rounded-control px-3 py-1.5 text-sm transition-colors ${
                period === p.value
                  ? 'bg-ink text-ink-inverse'
                  : 'bg-surface-muted text-sub hover:bg-surface-hover hover:text-ink'
              }`}
            >
              {p.label}
            </Link>
          ))}
          <PdfDownloadButton
            targetId="agent-report-body"
            fileName={`${report.meta.agent_name}_평가리포트_${periodFileLabel(report.meta.period)}_${report.meta.generated_at.slice(0, 10)}.pdf`}
          />
        </div>
      </div>

      <div id="agent-report-body">
        <div className="grid grid-cols-4 gap-4 px-6 py-4">
          <div className="rounded-card border border-border bg-surface-card p-4">
            <div className="text-xs text-sub">채점 건수</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{report.summary.evaluation_count}</div>
          </div>
          <div className="rounded-card border border-border bg-surface-card p-4">
            <div className="text-xs text-sub">평균 점수</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {report.summary.avg_score !== null ? report.summary.avg_score.toFixed(1) : '—'}
            </div>
          </div>
          <div className="rounded-card border border-border bg-surface-card p-4">
            <div className="text-xs text-sub">위험 건</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-danger-text">{report.summary.risk_count}</div>
          </div>
          <div className="rounded-card border border-border bg-surface-card p-4">
            <div className="text-xs text-sub">약점 영역</div>
            <div className="mt-1 text-lg font-semibold">
              {report.summary.weak_domain ? (
                report.summary.weak_domain.label
              ) : (
                <span className="text-sm text-sub">없음</span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 px-6">
          <div className="rounded-card border border-border bg-surface-card p-4">
            <RadarChart domainRates={report.domain_rates} />
          </div>
          <div className="rounded-card border border-border bg-surface-card">
            <div className="border-b border-border-subtle px-4 py-2 text-sm font-medium">개선 필요 항목</div>
            <ImprovementItems
              items={report.improvement_items}
              totalCount={report.improvement_items_total_count}
            />
          </div>
        </div>

        <div id="item-detail" className="px-6 py-4">
          <div className="overflow-hidden rounded-card border border-border bg-surface-card">
            <ItemDetailTable items={report.items} />
          </div>
        </div>
      </div>
    </div>
  );
}
