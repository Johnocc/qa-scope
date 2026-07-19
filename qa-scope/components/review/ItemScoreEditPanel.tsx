'use client';

import { ITEM_NAMES, DOMAIN_NAMES, ITEM_CODES, domainOf, type ItemCode } from '@/lib/constants/rubric';
import { LEVELS, type Level } from '@/lib/scoring/constants';
import type { EvaluationItemScore } from '@/lib/types/evaluation';
import { useReviewOverrides } from './ReviewOverridesProvider';

const LEVEL_STYLE: Record<string, string> = {
  충족: 'bg-ok-bg text-ok-text',
  부분충족: 'bg-warn-bg text-warn-text',
  미충족: 'bg-danger-bg text-danger-text',
  해당없음: 'bg-na-bg text-na-text',
};

export default function ItemScoreEditPanel({
  items,
  readOnly = false,
}: {
  items: EvaluationItemScore[];
  readOnly?: boolean;
}) {
  const { overrides, setOverride, clearOverride } = useReviewOverrides();
  const byCode = new Map(items.map((it) => [it.항목코드, it]));
  let currentDomain = '';

  return (
    <div className="bg-surface-muted">
      <div className="border-b border-border-subtle px-4 py-2 text-sm font-semibold">
        {readOnly ? (
          '검수 확정 내역'
        ) : (
          <>
            항목별 점수 수정
            <span className="ml-2 text-xs font-normal text-sub">
              충족수준을 수정하면 점수·라벨은 저장 시 자동 재계산됩니다
            </span>
          </>
        )}
      </div>
      <div className="space-y-2.5 p-4">
        {ITEM_CODES.map((code) => {
          const it = byCode.get(code);
          if (!it) return null;
          const domain = domainOf(code);
          const showDomainHeader = domain !== currentDomain;
          currentDomain = domain;

          const aiLevel = it.충족수준;
          const overrideEntry = overrides.get(code);
          const isOverridden = overrideEntry !== undefined;
          const effectiveLevel = overrideEntry?.level_override ?? aiLevel;
          // 근거·코멘트는 AI 원본 판정 설명 — override 여부와 무관하게 항상 표시 (ItemScorePanel과 동일 로직)
          const firstJumpable = it.근거.find((e) => e.dialogue_id !== null);
          const hasNote = it.충족수준 === '해당없음' || firstJumpable || it.근거.length > 0 || it.코멘트;

          function handleSelect(level: Level) {
            if (readOnly) return;
            if (level === aiLevel) {
              clearOverride(code);
            } else {
              setOverride(code, level, overrideEntry?.override_reason ?? null);
            }
          }

          function handleReasonChange(reason: string) {
            if (readOnly || !overrideEntry) return;
            setOverride(code, overrideEntry.level_override, reason || null);
          }

          return (
            <div key={code} id={`item-${code}`} className="scroll-mt-4">
              {showDomainHeader && (
                <div className="px-1 pb-1 pt-2 text-xs font-semibold text-sub">
                  {domain}. {DOMAIN_NAMES[domain]}
                </div>
              )}
              <div className="rounded-card border border-border bg-surface-card p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      {code}. {ITEM_NAMES[code as ItemCode]}
                    </span>
                    <span className={`shrink-0 rounded-pill px-2.5 py-0.5 text-xs font-medium ${LEVEL_STYLE[effectiveLevel]}`}>
                      {effectiveLevel}
                    </span>
                    {isOverridden && (
                      <>
                        <span className="shrink-0 rounded-pill bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          수정됨
                        </span>
                        <span className="shrink-0 text-xs text-sub line-through">{aiLevel}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {LEVELS.map((level) => {
                    const active = level === effectiveLevel;
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() => handleSelect(level)}
                        disabled={readOnly}
                        className={`rounded-control border px-2.5 py-1 text-xs font-medium ${
                          active
                            ? 'border-ink bg-ink text-ink-inverse'
                            : 'border-border bg-surface-card text-sub hover:bg-surface-hover'
                        } ${readOnly ? 'cursor-default opacity-70' : ''}`}
                      >
                        {level}
                      </button>
                    );
                  })}
                </div>

                {hasNote && (
                  <div className="mt-2 space-y-1.5 rounded-control bg-surface-muted px-3 py-2 text-xs text-sub">
                    {it.코멘트 && <p>{it.코멘트}</p>}
                    {it.충족수준 === '해당없음' ? (
                      <p>해당없음(N/A)이라 근거 발화가 없습니다</p>
                    ) : firstJumpable ? (
                      <a href={`#d-${firstJumpable.dialogue_id}`} className="text-ink underline decoration-border underline-offset-2 hover:decoration-ink">
                        근거 발화 보기 →
                      </a>
                    ) : it.근거.length > 0 ? (
                      <p>(인용 대조 실패 — 원문에서 못 찾음)</p>
                    ) : null}
                  </div>
                )}

                {readOnly
                  ? overrideEntry?.override_reason && (
                      <textarea
                        value={overrideEntry.override_reason}
                        readOnly
                        disabled
                        rows={2}
                        className="mt-2 w-full rounded-control border border-border bg-surface-muted px-2 py-1.5 text-xs text-sub"
                      />
                    )
                  : isOverridden && (
                      <textarea
                        placeholder="수정 사유 (선택)"
                        value={overrideEntry.override_reason ?? ''}
                        onChange={(e) => handleReasonChange(e.target.value)}
                        rows={2}
                        className="mt-2 w-full rounded-control border border-border bg-surface-card px-2 py-1.5 text-xs placeholder:text-sub/60 focus:outline-none focus:ring-2 focus:ring-ink/20"
                      />
                    )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
