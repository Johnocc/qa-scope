import { listTips } from '@/lib/db/coachingTipsRepo';
import TipsEditor from '@/components/admin/TipsEditor';

export default async function CoachingTipsPage() {
  const tips = await listTips();

  return (
    <div>
      <h2 className="text-lg font-semibold text-ink">코칭 팁 관리</h2>
      <div className="mt-4">
        <TipsEditor initialTips={tips} />
      </div>
    </div>
  );
}
