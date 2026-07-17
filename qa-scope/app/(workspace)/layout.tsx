import TabNav from "@/components/layout/TabNav";
import UserMenu from "@/components/auth/UserMenu";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="border-b border-border bg-surface-card">
        <div className="mx-auto max-w-[1600px] px-6">
          <div className="flex items-center justify-between pt-3">
            <h1 className="text-base font-semibold tracking-tight">
              한빛생명 상담품질 자동채점 시스템
            </h1>
            <UserMenu />
          </div>
          <TabNav />
        </div>
      </header>
      <main className="mx-auto max-w-[1600px]">{children}</main>
    </>
  );
}
