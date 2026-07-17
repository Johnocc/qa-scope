'use client';

/**
 * components/admin/AdminNav.tsx — 관리자 콘솔 사이드바 메뉴.
 * 현재 경로 활성 표시가 필요해 클라이언트 컴포넌트로 분리
 * (레이아웃 자체는 서버 컴포넌트로 유지).
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const MENU = [
  { href: '/admin', label: '저점수 컷' },
  { href: '/admin/coaching-tips', label: '코칭 팁' },
  { href: '/admin/policy-documents', label: '약관 문서' },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="space-y-1">
      {MENU.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`block rounded-control px-3 py-2 text-sm transition-colors ${
              active
                ? 'bg-surface-hover font-medium text-ink'
                : 'text-sub hover:bg-surface-hover hover:text-ink'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
