import { getEvaluations } from '@/lib/api/evaluations';
import FilterBar from '@/components/evaluations/FilterBar';
import EvaluationTable from '@/components/evaluations/EvaluationTable';

export default async function EvaluationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;

  const data = await getEvaluations({
    date_from: sp.date_from,
    date_to: sp.date_to,
    agent_id: sp.agent_id,
    consult_type: sp.consult_type,
    status: sp.status,
    review_status: sp.review_status,
    risk_flagged: sp.risk_flagged,
    sort: (sp.sort as 'risk' | 'date') ?? 'risk',
    limit: 50,
    offset: 0,
  });

  return (
    <div>
      <FilterBar searchParams={sp} />
      <EvaluationTable items={data.items} />
      <div className="border-t border-border px-6 py-4 text-sm text-sub">
        전량 {data.summary.total_count}건 채점 완료 · 위험 {data.summary.risk_count}건 · 표시 중{' '}
        {data.summary.filtered_count}건
      </div>
    </div>
  );
}
