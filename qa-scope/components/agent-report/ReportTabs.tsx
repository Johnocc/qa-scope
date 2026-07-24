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
  improvementItemsTotalCount,
  items,
}: {
  domainRates: DomainRate[];
  improvementItems: ImprovementItem[];
  /** rate < warn 전체 개선대상 수(5개 초과분 포함) — 요약 탭 '외 N건 더' 표기용 */
  improvementItemsTotalCount: number;
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
          {/*
            차트 카드에 명시적 높이(h-[400px])를 준다 — compact RadarChart는
            maintainAspectRatio:false라 컨테이너 높이를 그대로 따라가므로, 높이를
            고정하지 않으면 오각형 크기가 옆 '개선 필요 항목' 패널의 내용 높이에
            끌려다녀(짧으면 작아짐) 가변적이 된다. 고정 높이로 이웃과 분리해
            오각형을 항상 크게 유지한다(눈금 숫자 가독성도 함께 개선). items-stretch
            덕에 짧은 패널은 같은 높이로 늘어나 두 카드가 나란히 정렬된다.
          */}
          <div className="h-[400px] rounded-card border border-border bg-surface-card p-4">
            <RadarChart domainRates={domainRates} compact />
          </div>
          <div className="rounded-card border border-border bg-surface-card">
            <div className="border-b border-border-subtle px-4 py-2 text-sm font-medium">개선 필요 항목</div>
            {/* 실제 전체 개선대상 수를 넘겨 '외 N건 더'가 뜨게 하고(요약은 상위 3건만
                미리보기), 클릭 시 '항목별 달성률' 탭으로 전환해 나머지 항목·코칭 팁을 보게 한다. */}
            <ImprovementItems
              items={shownImprovementItems}
              totalCount={improvementItemsTotalCount}
              onSeeMore={() => setTab('items')}
            />
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
