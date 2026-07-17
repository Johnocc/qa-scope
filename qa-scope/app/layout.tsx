import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "한빛생명 QA 자동채점",
  description: "콜센터 상담 품질 자동채점 시스템",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-dvh bg-surface text-ink">
        {children}
      </body>
    </html>
  );
}
