import Link from 'next/link';

export default function EvaluationNotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <p className="text-base font-semibold text-ink">평가를 찾을 수 없습니다</p>
      <p className="text-sm text-sub">
        삭제되었거나, 재채점으로 평가 번호가 변경되었을 수 있습니다.
      </p>
      <Link
        href="/evaluations"
        className="mt-2 rounded-control border border-border px-4 py-2 text-sm text-ink hover:bg-surface-hover"
      >
        목록으로 돌아가기
      </Link>
    </div>
  );
}
