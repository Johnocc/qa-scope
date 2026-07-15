/**
 * 순수 GET form — 클라이언트 JS 없이 URL 쿼리로 필터 상태를 표현한다.
 * (서버 컴포넌트인 app/evaluations/page.tsx가 searchParams를 그대로 읽음)
 */
export default function FilterBar({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  return (
    <form
      method="get"
      className="flex flex-wrap items-end gap-3 border-b border-border bg-surface-card px-6 py-4"
    >
      <div>
        <label className="mb-1 block text-xs text-sub">시작일</label>
        <input
          type="date"
          name="date_from"
          defaultValue={searchParams.date_from ?? ''}
          className="rounded-control border border-border bg-surface-card px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-sub">종료일</label>
        <input
          type="date"
          name="date_to"
          defaultValue={searchParams.date_to ?? ''}
          className="rounded-control border border-border bg-surface-card px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-sub">상담사 ID</label>
        <input
          type="text"
          name="agent_id"
          placeholder="AGT-001"
          defaultValue={searchParams.agent_id ?? ''}
          className="w-28 rounded-control border border-border bg-surface-card px-2 py-1.5 text-sm text-ink placeholder:text-sub/60 focus:outline-none focus:ring-2 focus:ring-ink/20"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-sub">상담 유형</label>
        <select
          name="consult_type"
          defaultValue={searchParams.consult_type ?? ''}
          className="rounded-control border border-border bg-surface-card px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
        >
          <option value="">전체</option>
          <option value="신규·보장">신규·보장</option>
          <option value="계약변경">계약변경</option>
          <option value="해지·환급">해지·환급</option>
          <option value="보험금청구">보험금청구</option>
          <option value="단순문의">단순문의</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-sub">상태</label>
        <select
          name="status"
          defaultValue={searchParams.status ?? ''}
          className="rounded-control border border-border bg-surface-card px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
        >
          <option value="">전체</option>
          <option value="불완전판매 의심">불완전판매 의심</option>
          <option value="저점수">저점수</option>
          <option value="정상">정상</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-sub">검수상태</label>
        <select
          name="review_status"
          defaultValue={searchParams.review_status ?? ''}
          className="rounded-control border border-border bg-surface-card px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
        >
          <option value="">전체</option>
          <option value="미검수">미검수</option>
          <option value="검수중">검수중</option>
          <option value="확정">확정</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-sub">위험</label>
        <select
          name="risk_flagged"
          defaultValue={searchParams.risk_flagged ?? ''}
          className="rounded-control border border-border bg-surface-card px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
        >
          <option value="">전체</option>
          <option value="true">위험만</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-sub">정렬</label>
        <select
          name="sort"
          defaultValue={searchParams.sort ?? 'risk'}
          className="rounded-control border border-border bg-surface-card px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
        >
          <option value="risk">위험·저점 우선</option>
          <option value="date">상담일 최신순</option>
        </select>
      </div>
      <button
        type="submit"
        className="rounded-control bg-ink px-4 py-1.5 text-sm font-medium text-ink-inverse transition-opacity hover:opacity-90 active:opacity-80"
      >
        조회
      </button>
    </form>
  );
}
