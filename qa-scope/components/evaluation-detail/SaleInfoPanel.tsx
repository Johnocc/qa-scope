import type { SaleInfo } from '@/lib/types/evaluation';

const VERDICT_STYLE: Record<string, string> = {
  '적합': 'bg-ok-bg text-ok-text border border-ok-border',
  '부적합': 'bg-warn-bg text-warn-text border border-warn-border',
  '명백한 오류': 'bg-danger-bg text-danger-text border border-danger-border',
};

const PROCEDURE_LABELS = [
  { key: '가입목적' as const, label: '가입 목적' },
  { key: '재정상황' as const, label: '재정 상황' },
  { key: '기존계약' as const, label: '기존 계약' },
];

export default function SaleInfoPanel({ saleInfo }: { saleInfo: SaleInfo }) {
  const { 확인절차, 매칭판정, 권유상품명, 권유상품코드 } = saleInfo;

  // 방어: 확인절차가 예상 형태가 아니면 폴백
  const isValidProcedure =
    확인절차 !== null &&
    typeof 확인절차 === 'object' &&
    typeof 확인절차.가입목적 === 'boolean' &&
    typeof 확인절차.재정상황 === 'boolean' &&
    typeof 확인절차.기존계약 === 'boolean';

  if (!isValidProcedure) {
    console.warn('[SaleInfoPanel] 확인절차 필드가 예상 형태가 아님 — 텍스트 폴백:', 확인절차);
    return (
      <div className="border-b border-border-subtle px-4 py-3 text-xs text-sub">
        적합성 확인 절차 데이터를 표시할 수 없습니다.
      </div>
    );
  }

  const confirmedCount = PROCEDURE_LABELS.filter(({ key }) => 확인절차[key]).length;

  return (
    <div className="border-b border-border px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-sub">적합성 확인 절차</span>
        <span className="text-xs text-sub">확인 {confirmedCount}/3</span>
      </div>

      {/* 3행 체크리스트 */}
      <ul className="mb-3 space-y-1">
        {PROCEDURE_LABELS.map(({ key, label }) => {
          const checked = 확인절차[key];
          return (
            <li key={key} className="flex items-center gap-2 text-xs">
              <span
                className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold leading-none ${
                  checked
                    ? 'bg-ok-bg text-ok-text'
                    : 'bg-danger-bg text-danger-text'
                }`}
              >
                {checked ? '✓' : '✗'}
              </span>
              <span className={checked ? 'text-ink' : 'text-sub'}>{label}</span>
            </li>
          );
        })}
      </ul>

      {/* 매칭판정 배지 + 권유 상품 */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-pill px-2.5 py-0.5 text-xs font-medium ${
            VERDICT_STYLE[매칭판정] ?? 'bg-na-bg text-na-text'
          }`}
        >
          {매칭판정}
        </span>
        <span className="text-xs text-sub">
          {권유상품명 ?? 권유상품코드}
        </span>
      </div>
    </div>
  );
}
