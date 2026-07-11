import Link from 'next/link';
import ScoreBar from '../common/ScoreBar';
import EmptyState from '../common/EmptyState';
import type { AgentSummaryRow, Period } from '@/lib/types/agent';

/**
 * 순위·등수는 계산·표시하지 않는다 — 화면③·④는 인사고과가 아니라 코칭
 * (약점 진단) 도구다 (계약 §1 결정 5). 정렬은 서버가 이미 평균점수 내림차순으로
 * 내려준 순서를 그대로 쓴다.
 */
export default function AgentTable({ agents, period }: { agents: AgentSummaryRow[]; period: Period }) {
  if (agents.length === 0) {
    return <EmptyState message="해당 기간에 채점된 상담이 없습니다" />;
  }

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
        <tr>
          <th className="text-left px-4 py-2 font-medium">상담사</th>
          <th className="text-right px-4 py-2 font-medium">건수</th>
          <th className="text-left px-4 py-2 font-medium">평균점수</th>
          <th className="text-right px-4 py-2 font-medium">위험</th>
          <th className="text-left px-4 py-2 font-medium">약점 항목</th>
        </tr>
      </thead>
      <tbody>
        {agents.map((a) => (
          <tr key={a.agent_id} className="border-t border-gray-100">
            <td className="px-4 py-2">
              {a.agent_id === 'unknown' ? (
                <span className="text-gray-400">{a.agent_name}</span>
              ) : (
                <Link
                  href={`/agents/${a.agent_id}/report?period=${period}`}
                  className="text-blue-600 hover:underline"
                >
                  {a.agent_name}
                </Link>
              )}
            </td>
            <td className="px-4 py-2 text-right tabular-nums">{a.evaluation_count}</td>
            <td className="px-4 py-2">
              <ScoreBar rate={a.avg_score} />
            </td>
            <td className="px-4 py-2 text-right tabular-nums">{a.risk_count}</td>
            <td className="px-4 py-2">
              {a.weak_domain ? a.weak_domain.label : <span className="text-gray-400">없음</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
