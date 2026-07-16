import type { Metadata } from "next";
import TabNav from "@/components/layout/TabNav";
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
        <header className="border-b border-border bg-surface-card">
          <div className="mx-auto max-w-[1600px] px-6">
            <h1 className="pt-3 text-base font-semibold tracking-tight">
              한빛생명 상담품질 자동채점 시스템
            </h1>
            <TabNav />
          </div>
        </header>
        <main className="mx-auto max-w-[1600px]">{children}</main>
      </body>
    </html>
  );
}
