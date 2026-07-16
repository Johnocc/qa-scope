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
      <div className="flex gap-2 border-b border-border bg-surface-card px-6 py-4">
        {PERIODS.map((p) => (
          <Link
            key={p.value}
            href={`/agents?period=${p.value}`}
            className={`rounded-control px-3 py-1.5 text-sm transition-colors ${
              period === p.value
                ? 'bg-primary text-ink-inverse'
                : 'bg-surface-muted text-sub hover:bg-surface-hover hover:text-ink'
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>
      <AgentSummaryCards summary={data.summary} />
      <AgentTable agents={data.agents} period={period} />
    </div>
  );
}
