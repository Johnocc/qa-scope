import Link from 'next/link';
import RiskDot from '../common/RiskDot';
import StatusBadge from '../common/StatusBadge';
import EmptyState from '../common/EmptyState';
import type { EvaluationListItem } from '@/lib/types/evaluation';

const REVIEW_STATUS_STYLE: Record<string, string> = {
  '미검수': 'bg-na-bg text-na-text border border-border',
  '검수중': 'bg-warn-bg text-warn-text border border-warn-border',
  '확정':   'bg-ok-bg text-ok-text border border-ok-border',
};

export default function EvaluationTable({ items }: { items: EvaluationListItem[] }) {
  if (items.length === 0) {
    return <EmptyState message="조건에 맞는 상담이 없습니다" />;
  }

  return (
    <table className="w-full text-sm">
      <thead className="bg-surface-muted text-xs uppercase tracking-wide text-sub">
        <tr>
          <th className="px-4 py-2 text-left font-medium">상담번호</th>
          <th className="px-4 py-2 text-left font-medium">상담사</th>
          <th className="px-4 py-2 text-left font-medium">유형</th>
          <th className="px-4 py-2 text-left font-medium">상담일</th>
          <th className="px-4 py-2 text-right font-medium">총점</th>
          <th className="px-4 py-2 text-left font-medium">상태</th>
          <th className="px-4 py-2 text-left font-medium">검수</th>
          <th className="px-4 py-2" />
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr
            key={item.evaluation_id}
            className={`border-t border-border-subtle ${item.risk_flagged ? 'bg-danger-bg/50' : ''}`}
          >
            <td className="px-4 py-2.5 font-medium">{item.consultation_code}</td>
            <td className="px-4 py-2.5">{item.agent_name}</td>
            <td className="px-4 py-2.5">{item.consult_type ?? '—'}</td>
            <td className="px-4 py-2.5 text-sub">{item.consulted_at}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{item.final_score.toFixed(1)}</td>
            <td className="px-4 py-2.5">
              <div className="flex items-center gap-2">
                <RiskDot active={item.risk_flagged} />
                <StatusBadge labels={item.status_labels} />
              </div>
            </td>
            <td className="px-4 py-2.5">
              <span className={`rounded-pill px-2.5 py-0.5 text-xs font-medium ${REVIEW_STATUS_STYLE[item.review_status] ?? 'bg-na-bg text-na-text'}`}>
                {item.review_status}
              </span>
            </td>
            <td className="px-4 py-2.5 text-right">
              <Link
                href={`/evaluations/${item.evaluation_id}`}
                className="font-medium text-ink underline decoration-border underline-offset-4 hover:decoration-ink"
              >
                보기
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
