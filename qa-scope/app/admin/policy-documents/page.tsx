import db from '@/lib/db';
import { list } from '@/lib/db/policyDocumentRepo';
import PolicyDocumentManager from '@/components/admin/PolicyDocumentManager';

export default async function PolicyDocumentsPage() {
  const items = await list();

  // GET 라우트와 동일 기준 — 미설정이면 throw(조용한 폴백 금지)
  const activeCollectionName = await db.config.get('rag_collection_name');
  if (!activeCollectionName) {
    throw new Error('rag_collection_name 미설정 — app_config 확인 필요');
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-ink">약관 문서 관리</h2>
      <div className="mt-4">
        <PolicyDocumentManager initialItems={items} initialActiveCollectionName={activeCollectionName} />
      </div>
    </div>
  );
}
