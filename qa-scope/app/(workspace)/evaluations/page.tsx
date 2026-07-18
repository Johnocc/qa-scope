import { getEvaluations } from '@/lib/api/evaluations';
import { listAgents } from '@/lib/db/agentRepo';
import FilterBar from '@/components/evaluations/FilterBar';
import EvaluationTable from '@/components/evaluations/EvaluationTable';
import UploadPanel from '@/components/evaluations/UploadPanel';

export default async function EvaluationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;

  const agents = await listAgents({ activeOnly: true });

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

  const filterActive = [
    sp.date_from,
    sp.date_to,
    sp.agent_id,
    sp.consult_type,
    sp.status,
    sp.review_status,
    sp.risk_flagged,
  ].some(Boolean);
  const showFiltered = data.summary.filtered_count !== data.summary.total_count || filterActive;

  return (
    <div>
      <FilterBar searchParams={sp}>
        <UploadPanel agents={agents} />
      </FilterBar>
      <EvaluationTable items={data.items} />
      <div className="border-t border-border px-6 py-4 text-sm text-sub">
        전체 {data.summary.total_count}건 · 위험 {data.summary.risk_count}건
        {showFiltered && <> · 조회 결과 {data.summary.filtered_count}건</>}
      </div>
    </div>
  );
}
