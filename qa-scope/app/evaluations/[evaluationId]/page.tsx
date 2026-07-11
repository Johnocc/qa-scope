import Link from 'next/link';
import { getEvaluationDetail } from '@/lib/api/evaluations';
import DialogueList from '@/components/evaluation-detail/DialogueList';
import ItemScorePanel from '@/components/evaluation-detail/ItemScorePanel';
import ReviewPanel from '@/components/evaluation-detail/ReviewPanel';
import StatusBadge from '@/components/common/StatusBadge';
import RiskDot from '@/components/common/RiskDot';

export default async function EvaluationDetailPage({
  params,
}: {
  params: Promise<{ evaluationId: string }>;
}) {
  const { evaluationId } = await params;
  const id = Number(evaluationId);
  const { header, evaluation, dialogues, review } = await getEvaluationDetail(id);

  // 화면 표시값 = COALESCE(검수 유효값, AI 원본) — 검수_쓰기_API계약_v1.md §4,
  // 화면② 계약 v1.1. 검수 없으면(review: null) AI 원본 그대로.
  const displayScore = review?.effective.final_score ?? evaluation.집계.환산총점;
  const displayLabels = review?.effective.status_labels ?? header.status_labels;
  const displayRisk = review?.effective.risk_flagged ?? header.risk_flagged;

  return (
    <div>
      <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-3 flex-wrap">
        <Link href="/evaluations" className="text-sm text-gray-500 hover:underline">
          ← 목록으로
        </Link>
        <h2 className="text-base font-semibold">{header.consultation_code}</h2>
        <span className="text-sm text-gray-500">{header.agent_name || header.agent_id || '상담사 정보 없음'}</span>
        <span className="text-sm text-gray-500">{header.consult_type ?? '—'}</span>
        <RiskDot active={displayRisk} />
        <StatusBadge labels={displayLabels} />
        <span className="ml-auto text-lg font-semibold tabular-nums">{displayScore.toFixed(1)}점</span>
      </div>
      <div className="grid grid-cols-2">
        <div className="border-r border-gray-200 max-h-[calc(100vh-9rem)] overflow-y-auto">
          <DialogueList dialogues={dialogues} />
        </div>
        <div className="max-h-[calc(100vh-9rem)] overflow-y-auto">
          <ItemScorePanel items={evaluation.항목평가} />
        </div>
      </div>
      <ReviewPanel evaluationId={id} review={review} />
    </div>
  );
}
