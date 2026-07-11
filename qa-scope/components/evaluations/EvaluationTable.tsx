import Link from 'next/link';
import RiskDot from '../common/RiskDot';
import StatusBadge from '../common/StatusBadge';
import EmptyState from '../common/EmptyState';
import type { EvaluationListItem } from '@/lib/types/evaluation';

export default function EvaluationTable({ items }: { items: EvaluationListItem[] }) {
  if (items.length === 0) {
    return <EmptyState message="조건에 맞는 상담이 없습니다" />;
  }

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
        <tr>
          <th className="text-left px-4 py-2 font-medium">상담번호</th>
          <th className="text-left px-4 py-2 font-medium">상담사</th>
          <th className="text-left px-4 py-2 font-medium">유형</th>
          <th className="text-left px-4 py-2 font-medium">상담일</th>
          <th className="text-right px-4 py-2 font-medium">총점</th>
          <th className="text-left px-4 py-2 font-medium">상태</th>
          <th className="px-4 py-2" />
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr
            key={item.evaluation_id}
            className={`border-t border-gray-100 ${item.risk_flagged ? 'bg-red-50/60' : ''}`}
          >
            <td className="px-4 py-2">{item.consultation_code}</td>
            <td className="px-4 py-2">{item.agent_name}</td>
            <td className="px-4 py-2">{item.consult_type ?? '—'}</td>
            <td className="px-4 py-2 text-gray-500">{item.consulted_at}</td>
            <td className="px-4 py-2 text-right tabular-nums">{item.final_score.toFixed(1)}</td>
            <td className="px-4 py-2">
              <div className="flex items-center gap-2">
                <RiskDot active={item.risk_flagged} />
                <StatusBadge labels={item.status_labels} />
              </div>
            </td>
            <td className="px-4 py-2 text-right">
              <Link href={`/evaluations/${item.evaluation_id}`} className="text-blue-600 hover:underline">
                보기
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
