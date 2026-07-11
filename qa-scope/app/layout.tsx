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
      <body className="bg-gray-50 text-gray-900">
        <header className="bg-white">
          <div className="px-6 py-4">
            <h1 className="text-lg font-semibold">한빛생명 상담품질 자동채점 시스템</h1>
          </div>
          <TabNav />
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
