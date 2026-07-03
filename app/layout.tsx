import type { ReactNode } from 'react';

export const metadata = {
  title: 'QA Scope — 콜센터 상담 품질 자동채점',
  description: '한빛생명(가상) 콜센터 QA 대시보드',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
