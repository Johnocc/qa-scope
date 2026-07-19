'use client';

import { useState } from 'react';
import ItemScorePanel from '@/components/evaluation-detail/ItemScorePanel';
import SaleInfoPanel from '@/components/evaluation-detail/SaleInfoPanel';
import SummaryPanel from '@/components/evaluation-detail/SummaryPanel';
import type { EvaluationItemScore, SaleInfo } from '@/lib/types/evaluation';
import ItemScoreEditPanel from './ItemScoreEditPanel';

type Tab = 'ver1' | 'ver2';

export default function ScorePanelTabs({
  items,
  locked,
  score,
  labels,
  saleInfo,
}: {
  items: EvaluationItemScore[];
  locked: boolean;
  score: number;
  labels: string[];
  saleInfo: SaleInfo | null;
}) {
  const [tab, setTab] = useState<Tab>('ver1');

  return (
    <div>
      <nav className="sticky top-0 z-10 border-b border-border-subtle bg-surface-card px-4">
        <ul className="flex gap-6">
          <li>
            <button
              type="button"
              onClick={() => setTab('ver1')}
              className={`inline-block border-b-2 py-3 text-sm transition-colors ${
                tab === 'ver1'
                  ? 'border-ink font-medium text-ink'
                  : 'border-transparent text-sub hover:text-ink'
              }`}
            >
              AI 채점 (ver1)
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setTab('ver2')}
              className={`inline-block border-b-2 py-3 text-sm transition-colors ${
                tab === 'ver2'
                  ? 'border-ink font-medium text-ink'
                  : 'border-transparent text-sub hover:text-ink'
              }`}
            >
              검수 (ver2)
            </button>
          </li>
        </ul>
      </nav>

      {tab === 'ver1' && (
        <>
          <SummaryPanel items={items} score={score} labels={labels} />
          {saleInfo && <SaleInfoPanel saleInfo={saleInfo} />}
          <ItemScorePanel items={items} />
        </>
      )}

      {tab === 'ver2' &&
        (locked ? (
          <div>
            <p className="px-4 pt-3 text-xs text-sub">
              확정된 검수입니다. 수정하려면 하단에서 검수를 철회하세요.
            </p>
            <ItemScorePanel items={items} />
          </div>
        ) : (
          <ItemScoreEditPanel items={items} />
        ))}
    </div>
  );
}
