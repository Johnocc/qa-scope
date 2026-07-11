import { ITEM_NAMES, DOMAIN_NAMES, ITEM_CODES, domainOf, type ItemCode } from '@/lib/constants/rubric';
import type { EvaluationItemScore } from '@/lib/types/evaluation';

const LEVEL_STYLE: Record<string, string> = {
  충족: 'bg-green-100 text-green-700',
  부분충족: 'bg-amber-100 text-amber-700',
  미충족: 'bg-red-100 text-red-700',
  해당없음: 'bg-gray-100 text-gray-500',
};

export default function ItemScorePanel({ items }: { items: EvaluationItemScore[] }) {
  const byCode = new Map(items.map((it) => [it.항목코드, it]));
  let currentDomain = '';

  return (
    <div className="divide-y divide-gray-100">
      {ITEM_CODES.map((code) => {
        const it = byCode.get(code);
        if (!it) return null;
        const domain = domainOf(code);
        const showDomainHeader = domain !== currentDomain;
        currentDomain = domain;
        // 근거가 여러 개면 첫 근거로 점프, 나머지는 목록 표시 (계약 §4-2)
        const firstJumpable = it.근거.find((e) => e.dialogue_id !== null);

        return (
          <div key={code}>
            {showDomainHeader && (
              <div className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400">
                {domain}. {DOMAIN_NAMES[domain]}
              </div>
            )}
            <div className="px-4 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {code}. {ITEM_NAMES[code as ItemCode]}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${LEVEL_STYLE[it.충족수준]}`}>
                  {it.충족수준}
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {it.획득점수} / {it.배점}점
                {it.충족수준 === '해당없음' ? (
                  <span className="ml-2">해당없음(N/A)이라 근거 발화가 없습니다</span>
                ) : firstJumpable ? (
                  <a href={`#d-${firstJumpable.dialogue_id}`} className="ml-2 text-blue-600 hover:underline">
                    근거 발화 보기 →
                  </a>
                ) : it.근거.length > 0 ? (
                  <span className="ml-2 text-gray-400">(인용 대조 실패 — 원문에서 못 찾음)</span>
                ) : null}
              </div>
              {it.코멘트 && <p className="text-xs text-gray-600 mt-1">{it.코멘트}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
