/**
 * app/login/page.tsx — 로그인 화면(최소 기능 검증용, 민재 UI 담당 전 임시).
 *
 * 정본 계약: docs/db/로그인 설계문서 v1 20260716.md §5.
 *  - 구성: 서비스명 + username + password + 로그인 버튼. 회원가입·비번찾기 링크 없음.
 *  - proxy.ts가 미인증 접근을 여기로 보내며 ?callbackUrl 로 원래 목적지를 전달.
 *  - 이미 로그인한 사용자는 목적지로 즉시 보낸다(로그인 화면 재노출 방지).
 */
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import LoginForm from '@/components/login/LoginForm';

export const metadata = { title: '로그인 — 한빛생명 QA' };

// 오픈 리다이렉트 방지 — 상대경로만 허용(//host, https://... 차단).
function safeCallback(raw: string | undefined): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/';
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const sp = await searchParams;
  const callbackUrl = safeCallback(sp.callbackUrl);

  const session = await auth();
  if (session?.user) redirect(callbackUrl);

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center px-6">
      <div className="rounded-card border border-border bg-surface-card p-6">
        <h2 className="mb-1 text-lg font-semibold text-ink">로그인</h2>
        <p className="mb-5 text-sm text-sub">한빛생명 상담품질 자동채점 시스템</p>
        <LoginForm callbackUrl={callbackUrl} />
      </div>
    </div>
  );
}
