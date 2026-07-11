import type { AgentsSummaryResponse } from '@/lib/types/agent';

/** avg_score는 기간 내 평가 0건이면 null — 0점과 다르므로 "—"로 방어 표시 (평균 없음 ≠ 0점) */
export default function AgentSummaryCards({ summary }: { summary: AgentsSummaryResponse['summary'] }) {
  const cards = [
    { label: '전체 평균', value: summary.avg_score !== null ? summary.avg_score.toFixed(1) : '—' },
    { label: '채점 건수', value: String(summary.evaluation_count) },
    { label: '위험 건', value: String(summary.risk_count) },
    { label: '상담사 수', value: String(summary.agent_count) },
  ];
  return (
    <div className="grid grid-cols-4 gap-4 px-6 py-4">
      {cards.map((c) => (
        <div key={c.label} className="bg-white rounded border border-gray-200 p-4">
          <div className="text-xs text-gray-500">{c.label}</div>
          <div className="text-2xl font-semibold mt-1">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
