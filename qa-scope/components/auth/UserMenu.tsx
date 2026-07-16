/**
 * components/auth/UserMenu.tsx — 헤더 우측 사용자 표시 + 로그아웃(검증용 최소).
 * 설계문서 §5: "로그아웃은 헤더에 버튼 1개". 위치·디자인은 UI 담당이 다듬는다.
 * 서버 컴포넌트에서 세션을 읽고, 로그아웃은 인라인 서버 액션(signOut)으로 처리.
 */
import { auth, signOut } from '@/auth';

export default async function UserMenu() {
  const session = await auth();
  if (!session?.user) return null; // 미인증(예: /login)에서는 표시 안 함

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-sub">
        <span className="font-medium text-ink">{session.user.display_name}</span>님
      </span>
      <form
        action={async () => {
          'use server';
          await signOut({ redirectTo: '/login' });
        }}
      >
        <button
          type="submit"
          className="rounded-control border border-border px-3 py-1.5 text-sub transition-colors hover:bg-surface-hover hover:text-ink"
        >
          로그아웃
        </button>
      </form>
    </div>
  );
}
