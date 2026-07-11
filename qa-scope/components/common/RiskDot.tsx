/**
 * risk_flagged는 상태라벨과 별개 레이어다 — 라벨이 "정상"이어도 위험플래그가
 * 있으면 켜져야 한다 (초록불에 묻히지 않게 하는 안전망, CLAUDE.md §8.4).
 * 그래서 이 컴포넌트는 status_labels를 절대 참조하지 않고 risk_flagged만 본다.
 */
export default function RiskDot({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full bg-danger-text align-middle"
      title="위험 건"
      aria-label="위험 건"
    />
  );
}
