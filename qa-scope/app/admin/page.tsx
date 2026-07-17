import db from '@/lib/db';
import CutForm from '@/components/admin/CutForm';

export default async function AdminPage() {
  const raw = await db.config.get('low_score_cut', null);
  const parsed = raw === null || raw === '' ? null : Number(raw);
  const currentCut = parsed !== null && Number.isFinite(parsed) ? parsed : null;

  return (
    <div>
      <h2 className="text-lg font-semibold text-ink">저점수 컷 설정</h2>
      <div className="mt-4">
        <CutForm initialCut={currentCut} />
      </div>
    </div>
  );
}
