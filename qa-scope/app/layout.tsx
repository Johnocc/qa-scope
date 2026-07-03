import type { Metadata } from "next";

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
      <body>{children}</body>
    </html>
  );
}
