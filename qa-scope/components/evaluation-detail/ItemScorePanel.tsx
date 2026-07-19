// 현재 화면②에서는 미사용(단일 패널 전환, ItemScoreEditPanel로 대체) —
// 검수 이력 상세(과거 스냅샷 읽기 전용 표시)에서 재사용 예정이라 보존.
import { ITEM_NAMES, DOMAIN_NAMES, ITEM_CODES, domainOf, type ItemCode } from '@/lib/constants/rubric';
import type { EvaluationItemScore } from '@/lib/types/evaluation';

const LEVEL_STYLE: Record<string, string> = {
  충족: 'bg-ok-bg text-ok-text',
  부분충족: 'bg-warn-bg text-warn-text',
  미충족: 'bg-danger-bg text-danger-text',
  해당없음: 'bg-na-bg text-na-text',
};

export default function ItemScorePanel({ items }: { items: EvaluationItemScore[] }) {
  const byCode = new Map(items.map((it) => [it.항목코드, it]));
  let currentDomain = '';

  return (
    <div className="bg-surface-muted">
      <div className="border-b border-border-subtle px-4 py-2 text-sm font-semibold">항목별 상세 점수</div>
      <div className="space-y-2.5 p-4">
        {ITEM_CODES.map((code) => {
          const it = byCode.get(code);
          if (!it) return null;
          const domain = domainOf(code);
          const showDomainHeader = domain !== currentDomain;
          currentDomain = domain;
          // 근거가 여러 개면 첫 근거로 점프, 나머지는 목록 표시 (계약 §4-2)
          const firstJumpable = it.근거.find((e) => e.dialogue_id !== null);
          const hasNote = it.충족수준 === '해당없음' || firstJumpable || it.근거.length > 0 || it.코멘트;

          return (
            <div key={code} id={`item-${code}`} className="scroll-mt-4">
              {showDomainHeader && (
                <div className="px-1 pb-1 pt-2 text-xs font-semibold text-sub">
                  {domain}. {DOMAIN_NAMES[domain]}
                </div>
              )}
              <div className="rounded-card border border-border bg-surface-card p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {code}. {ITEM_NAMES[code as ItemCode]}
                    </span>
                    <span className={`shrink-0 rounded-pill px-2.5 py-0.5 text-xs font-medium ${LEVEL_STYLE[it.충족수준]}`}>
                      {it.충족수준}
                    </span>
                  </div>
                  <span className="shrink-0 text-base font-bold tabular-nums">
                    {it.획득점수} / {it.배점}점
                  </span>
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
