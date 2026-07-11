'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/evaluations', label: '채점 결과 목록' },
  { href: '/agents', label: '상담사별 대시보드' },
];

export default function TabNav() {
  const pathname = usePathname();
  return (
    <nav>
      <ul className="flex gap-6">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={`inline-block border-b-2 py-3 text-sm transition-colors ${
                  active
                    ? 'border-ink font-medium text-ink'
                    : 'border-transparent text-sub hover:text-ink'
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
