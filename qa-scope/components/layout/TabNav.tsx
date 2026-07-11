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
    <nav className="border-b border-gray-200 px-6">
      <ul className="flex gap-6">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={`inline-block py-3 text-sm border-b-2 ${
                  active
                    ? 'border-gray-900 text-gray-900 font-medium'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
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
