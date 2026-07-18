'use client';

/**
 * components/agent-report/ReportTabs.tsx — 화면④ 요약/항목별 달성률 탭 전환.
 * 화면에 보이는 인터랙티브 영역 전용 — PDF 캡처 대상이 아니다(page.tsx의
 * 숨김 전체 레이아웃이 캡처를 담당). 탭 상태만 관리하고, report 데이터는
 * page.tsx(서버 컴포넌트)가 그대로 내려준다.
 */
import { useState } from 'react';
import RadarChart from './RadarChart';
import ImprovementItems from './ImprovementItems';
import ItemDetailTable from './ItemDetailTable';
import type { DomainRate, ImprovementItem, AgentReportItem } from '@/lib/types/agent';

type Tab = 'summary' | 'items';

const TABS: { value: Tab; label: string }[] = [
  { value: 'summary', label: '요약' },
  { value: 'items', label: '항목별 달성률' },
];

export default function ReportTabs({
  domainRates,
  improvementItems,
  items,
}: {
  domainRates: DomainRate[];
  improvementItems: ImprovementItem[];
  items: AgentReportItem[];
}) {
  const [tab, setTab] = useState<Tab>('summary');
  const shownImprovementItems = improvementItems.slice(0, 3);

  return (
    <div>
      <div className="flex gap-2 px-6 pt-4">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`rounded-control px-3 py-1.5 text-sm transition-colors ${
              tab === t.value
                ? 'bg-primary text-ink-inverse'
                : 'bg-surface-muted text-sub hover:bg-surface-hover hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'summary' && (
        <div className="grid grid-cols-2 items-stretch gap-4 px-6 py-4">
          <div className="rounded-card border border-border bg-surface-card p-4">
            <RadarChart domainRates={domainRates} compact />
          </div>
          <div className="rounded-card border border-border bg-surface-card">
            <div className="border-b border-border-subtle px-4 py-2 text-sm font-medium">개선 필요 항목</div>
            <ImprovementItems items={shownImprovementItems} totalCount={shownImprovementItems.length} />
          </div>
        </div>
      )}

      {tab === 'items' && (
        <div className="px-6 py-4">
          <div className="overflow-hidden rounded-card border border-border bg-surface-card">
            <div className="border-b border-border-subtle px-4 py-2 text-sm font-semibold">항목별 달성률 — 기간 평균</div>
            <ItemDetailTable items={items} />
          </div>
        </div>
      )}
    </div>
  );
}
