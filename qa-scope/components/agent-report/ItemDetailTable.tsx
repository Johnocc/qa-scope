import { Fragment } from 'react';
import ScoreBar from '../common/ScoreBar';
import type { AgentReportItem } from '@/lib/types/agent';

const STATUS_STYLE: Record<string, string> = {
  양호: 'text-ok-text',
  보통: 'text-warn-text',
  '개선 필요': 'text-danger-text',
  해당없음: 'text-sub',
};

export default function ItemDetailTable({ items }: { items: AgentReportItem[] }) {
  let currentDomain = '';
  return (
    <table className="w-full text-base">
      <thead className="bg-surface-muted text-sm uppercase tracking-wide text-sub">
        <tr>
          <th className="px-4 py-2.5 text-left font-medium">항목</th>
          <th className="px-4 py-2.5 text-left font-medium">달성률</th>
          <th className="px-4 py-2.5 text-left font-medium">상태</th>
          <th className="px-4 py-2.5 text-right font-medium">적용 건수</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it) => {
          const showDomainHeader = it.domain_code !== currentDomain;
          currentDomain = it.domain_code;
          return (
            <Fragment key={it.item_code}>
              {showDomainHeader && (
                <tr>
                  <td colSpan={4} className="px-4 pt-3 pb-1 text-sm font-semibold text-sub">
                    {it.domain_code}영역
                  </td>
                </tr>
              )}
              <tr className="border-t border-border-subtle">
                <td className="px-4 py-3">
                  {it.item_code}. {it.item_name}
                </td>
                <td className="px-4 py-3">
                  <ScoreBar rate={it.rate} />
                </td>
                <td className={`px-4 py-3 font-medium ${STATUS_STYLE[it.status] ?? ''}`}>{it.status}</td>
                <td className="px-4 py-3 text-right tabular-nums">{it.applied_count}</td>
              </tr>
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
