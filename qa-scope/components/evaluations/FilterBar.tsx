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
      className="flex flex-wrap items-end gap-3 px-6 py-4 bg-white border-b border-gray-200"
    >
      <div>
        <label className="block text-xs text-gray-500 mb-1">시작일</label>
        <input
          type="date"
          name="date_from"
          defaultValue={searchParams.date_from ?? ''}
          className="border border-gray-300 rounded px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">종료일</label>
        <input
          type="date"
          name="date_to"
          defaultValue={searchParams.date_to ?? ''}
          className="border border-gray-300 rounded px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">상담사 ID</label>
        <input
          type="text"
          name="agent_id"
          placeholder="AGT-001"
          defaultValue={searchParams.agent_id ?? ''}
          className="border border-gray-300 rounded px-2 py-1 text-sm w-28"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">상담 유형</label>
        <select
          name="consult_type"
          defaultValue={searchParams.consult_type ?? ''}
          className="border border-gray-300 rounded px-2 py-1 text-sm"
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
        <label className="block text-xs text-gray-500 mb-1">상태</label>
        <select
          name="status"
          defaultValue={searchParams.status ?? ''}
          className="border border-gray-300 rounded px-2 py-1 text-sm"
        >
          <option value="">전체</option>
          <option value="불완전판매 의심">불완전판매 의심</option>
          <option value="저점수">저점수</option>
          <option value="정상">정상</option>
        </select>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">정렬</label>
        <select
          name="sort"
          defaultValue={searchParams.sort ?? 'risk'}
          className="border border-gray-300 rounded px-2 py-1 text-sm"
        >
          <option value="risk">위험·저점 우선</option>
          <option value="date">상담일 최신순</option>
        </select>
      </div>
      <button
        type="submit"
        className="bg-gray-900 text-white text-sm px-4 py-1.5 rounded hover:bg-gray-800"
      >
        조회
      </button>
    </form>
  );
}
