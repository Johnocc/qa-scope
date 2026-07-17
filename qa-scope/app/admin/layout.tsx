/**
 * app/admin/layout.tsx — 관리자 콘솔 레이아웃 (사이드바 + 내용 영역).
 * 접근 제어는 proxy.ts에서 처리(ADMIN 전용) — 여기선 UI 뼈대만 구성한다.
 * 화면①~④(업무 화면)의 상단 탭 구조와 구분되는 사이드바형 레이아웃.
 */
import AdminNav from '@/components/admin/AdminNav';
import UserMenu from '@/components/auth/UserMenu';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[1600px]">
      <aside className="flex w-56 shrink-0 flex-col justify-between border-r border-border bg-surface-card px-4 py-6">
        <div>
          <h2 className="mb-4 px-3 text-sm font-semibold text-ink">관리자 콘솔</h2>
          <AdminNav />
        </div>
        <UserMenu />
      </aside>
      <div className="flex-1 px-6 py-6">{children}</div>
    </div>
  );
}
