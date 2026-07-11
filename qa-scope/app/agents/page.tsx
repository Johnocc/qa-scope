import Link from 'next/link';
import { getAgentsSummary } from '@/lib/api/agents';
import type { Period } from '@/lib/types/agent';
import AgentSummaryCards from '@/components/agents/AgentSummaryCards';
import AgentTable from '@/components/agents/AgentTable';

const PERIODS: { value: Period; label: string }[] = [
  { value: '30d', label: '최근 30일' },
  { value: '90d', label: '최근 90일' },
  { value: 'all', label: '전체 기간' },
];

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const period: Period = (sp.period as Period) ?? '30d';
  const data = await getAgentsSummary(period);

  return (
    <div>
      <div className="px-6 py-4 bg-white border-b border-gray-200 flex gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p.value}
            href={`/agents?period=${p.value}`}
            className={`text-sm px-3 py-1.5 rounded ${
              period === p.value ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>
      <AgentSummaryCards summary={data.summary} />
      <AgentTable agents={data.agents} period={period} />
      <div className="px-6 py-4 text-xs text-gray-400">
        코칭(약점 진단) 도구입니다 — 순위·팀 비교는 표시하지 않습니다.
      </div>
    </div>
  );
}
