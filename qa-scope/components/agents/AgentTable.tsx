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
      <thead className="bg-surface-muted text-xs uppercase tracking-wide text-sub">
        <tr>
          <th className="px-4 py-2 text-left font-medium">상담사</th>
          <th className="px-4 py-2 text-right font-medium">건수</th>
          <th className="px-4 py-2 text-left font-medium">평균점수</th>
          <th className="px-4 py-2 text-right font-medium">위험</th>
          <th className="px-4 py-2 text-left font-medium">약점 항목</th>
          <th className="px-4 py-2 text-left font-medium">리포트</th>
        </tr>
      </thead>
      <tbody>
        {agents.map((a) => (
          <tr key={a.agent_id} className="border-t border-border-subtle">
            <td className="px-4 py-2.5">
              <span className={a.agent_id === 'unknown' ? 'text-sub' : 'font-medium text-ink'}>
                {a.agent_name}
              </span>
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums">{a.evaluation_count}</td>
            <td className="px-4 py-2.5">
              <ScoreBar rate={a.avg_score} />
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums">{a.risk_count}</td>
            <td className="px-4 py-2.5">
              {a.weak_domain ? a.weak_domain.label : <span className="text-sub">없음</span>}
            </td>
            <td className="px-4 py-2.5">
              {a.agent_id === 'unknown' ? (
                <span className="text-sub">—</span>
              ) : (
                <Link
                  href={`/agents/${a.agent_id}/report?period=${period}`}
                  className="rounded-control border border-border px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-hover"
                >
                  리포트 보기
                </Link>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
