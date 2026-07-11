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
      <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-3 flex-wrap">
        <Link href="/agents" className="text-sm text-gray-500 hover:underline">
          ← 대시보드로
        </Link>
        <h2 className="text-base font-semibold">{report.meta.agent_name}</h2>
        <span className="text-sm text-gray-500">
          {report.meta.period_from ?? ''} ~ {report.meta.period_to}
        </span>
        <div className="ml-auto flex gap-2 items-center">
          {PERIODS.map((p) => (
            <Link
              key={p.value}
              href={`/agents/${agentId}/report?period=${p.value}`}
              className={`text-sm px-3 py-1.5 rounded ${
                period === p.value ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p.label}
            </Link>
          ))}
          <PdfDownloadButton targetId="agent-report-body" fileName={`${report.meta.agent_name}_평가리포트.pdf`} />
        </div>
      </div>

      <div id="agent-report-body">
        <div className="grid grid-cols-4 gap-4 px-6 py-4">
          <div className="bg-white rounded border border-gray-200 p-4">
            <div className="text-xs text-gray-500">채점 건수</div>
            <div className="text-2xl font-semibold mt-1">{report.summary.evaluation_count}</div>
          </div>
          <div className="bg-white rounded border border-gray-200 p-4">
            <div className="text-xs text-gray-500">평균 점수</div>
            <div className="text-2xl font-semibold mt-1">
              {report.summary.avg_score !== null ? report.summary.avg_score.toFixed(1) : '—'}
            </div>
          </div>
          <div className="bg-white rounded border border-gray-200 p-4">
            <div className="text-xs text-gray-500">위험 건</div>
            <div className="text-2xl font-semibold mt-1">{report.summary.risk_count}</div>
          </div>
          <div className="bg-white rounded border border-gray-200 p-4">
            <div className="text-xs text-gray-500">약점 영역</div>
            <div className="text-lg font-semibold mt-1">
              {report.summary.weak_domain ? (
                report.summary.weak_domain.label
              ) : (
                <span className="text-gray-400 text-sm">없음</span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 px-6">
          <div className="bg-white rounded border border-gray-200 p-4">
            <RadarChart domainRates={report.domain_rates} />
          </div>
          <div className="bg-white rounded border border-gray-200">
            <div className="px-4 py-2 text-sm font-medium border-b border-gray-100">개선 필요 항목</div>
            <ImprovementItems items={report.improvement_items} />
          </div>
        </div>

        <div className="px-6 py-4">
          <div className="bg-white rounded border border-gray-200 overflow-hidden">
            <ItemDetailTable items={report.items} />
          </div>
        </div>
      </div>
    </div>
  );
}
