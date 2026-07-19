'use client';

/**
 * components/evaluations/UploadForm.tsx — 상담 텍스트 업로드 → 채점 실행 폼.
 * POST /api/evaluations/upload로 제출(색인 대신 채점 파이프라인 실행 — 1~2분
 * 소요). UploadPanel(모달) 안에서만 쓰인다 — 카드 테두리는 모달이 이미
 * 제공하므로 여기서는 폼 필드만 그린다.
 *
 * 상담일시는 날짜(date input) + 시각(HH:MM 텍스트) 입력을 받아 정규식으로
 * 형식 검증한 뒤 문자열로 직접 조합해 "YYYY-MM-DDTHH:mm"(API 계약)로 보낸다 —
 * Date 객체를 거치지 않아 타임존 이중변환 문제가 생기지 않는다(route.ts의
 * 동일 원칙).
 */
import { useRef, useState } from 'react';
import Link from 'next/link';
import { CONSULT_TYPES } from '@/lib/scoring/constants';

export interface AgentOption {
  agent_id: string;
  agent_name: string;
}

interface UploadResult {
  consultation_code: string;
  evaluation_id: number | null;
  final_score: number;
  status_label: string;
  risk_flagged: boolean;
  dropped_lines: number;
  unmatched_quotes: number;
  /** 음성 파일을 첨부했을 때만 응답에 존재(route.ts 계약) */
  audio_saved?: boolean;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_AUDIO_SIZE = 3.5 * 1024 * 1024; // 3.5MB — route.ts MAX_AUDIO_SIZE와 동일 값

interface Props {
  agents: AgentOption[];
  /** busy 상태가 바뀔 때마다 알림 — 모달의 닫기 버튼 비활성화 판단용 */
  onBusyChange?: (busy: boolean) => void;
  /** 채점 성공 직후(결과 표시 전) 알림 — X·배경 클릭으로 닫아도 새로고침이 필요함을 모달에 알림 */
  onResult?: () => void;
  /** 결과 확인 후 "확인" 클릭 시 */
  onClose?: () => void;
}

export default function UploadForm({ agents, onBusyChange, onResult, onClose }: Props) {
  const [busy, setBusyState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);

  function setBusy(next: boolean) {
    setBusyState(next);
    onBusyChange?.(next);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return; // 이중 제출 방지

    const time = timeRef.current?.value ?? '';
    if (!TIME_PATTERN.test(time)) {
      setError('시각을 HH:MM 형식으로 입력하세요 (예: 14:30)');
      return;
    }

    const audioFile = audioRef.current?.files?.[0];
    if (audioFile && audioFile.size > MAX_AUDIO_SIZE) {
      setError('음성 파일이 너무 큽니다. 3.5MB 이하만 첨부할 수 있습니다.');
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData(e.currentTarget);
      const date = dateRef.current?.value ?? '';
      formData.set('consulted_at', `${date}T${time}`);
      if (audioFile) {
        formData.append('audio', audioFile);
      }

      const res = await fetch('/api/evaluations/upload', {
        method: 'POST',
        body: formData,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.message ?? '업로드에 실패했습니다');
        return;
      }
      setResult(body);
      onResult?.();
    } catch {
      setError('업로드에 실패했습니다');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div>
        <div className="text-sm text-sub">
          채점 완료 —{' '}
          {result.evaluation_id !== null ? (
            <Link
              href={`/evaluations/${result.evaluation_id}`}
              className="underline decoration-sub underline-offset-4 hover:text-ink hover:decoration-ink"
            >
              {result.consultation_code}
            </Link>
          ) : (
            result.consultation_code
          )}
        </div>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-sub">환산총점</dt>
            <dd className="font-medium tabular-nums text-ink">{result.final_score}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sub">상태라벨</dt>
            <dd className="font-medium text-ink">{result.status_label}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sub">위험표시여부</dt>
            <dd className="font-medium text-ink">{result.risk_flagged ? '위험' : '정상'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sub">인식 실패 줄 수</dt>
            <dd className="font-medium tabular-nums text-ink">{result.dropped_lines}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sub">인용 불일치 건수</dt>
            <dd className="font-medium tabular-nums text-ink">{result.unmatched_quotes}</dd>
          </div>
        </dl>
        {result.audio_saved === false && (
          <p className="mt-3 text-xs text-danger-text">채점은 완료됐지만 음성 저장에 실패했습니다.</p>
        )}
        <button
          type="button"
          onClick={() => onClose?.()}
          className="mt-4 w-full rounded-control bg-primary px-4 py-2 text-sm font-medium text-ink-inverse transition-colors hover:bg-primary-hover"
        >
          확인
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label className="mb-1 block text-xs text-sub">상담 텍스트 파일 (.txt)</label>
        <input
          type="file"
          name="file"
          accept=".txt"
          required
          disabled={busy}
          className="w-full text-sm text-sub file:mr-3 file:rounded-control file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink disabled:opacity-50"
        />
      </div>

      <div className="mt-4">
        <label className="mb-1 block text-xs text-sub">상담 녹음 (선택)</label>
        <input
          ref={audioRef}
          type="file"
          accept=".mp3,.m4a,.wav"
          disabled={busy}
          className="w-full text-sm text-sub file:mr-3 file:rounded-control file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink disabled:opacity-50"
        />
      </div>

      <div className="mt-4">
        <label className="mb-1 block text-xs text-sub">상담사</label>
        <select
          name="agent_id"
          required
          disabled={busy}
          defaultValue=""
          className="w-full rounded-control border border-border bg-surface-card px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20 disabled:bg-surface-muted disabled:text-sub"
        >
          <option value="" disabled>
            선택하세요
          </option>
          {agents.map((a) => (
            <option key={a.agent_id} value={a.agent_id}>
              {a.agent_name} ({a.agent_id})
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        <label className="mb-1 block text-xs text-sub">상담일시</label>
        <div className="flex gap-2">
          <input
            ref={dateRef}
            type="date"
            required
            disabled={busy}
            className="flex-1 rounded-control border border-border bg-surface-card px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20 disabled:bg-surface-muted disabled:text-sub"
          />
          <input
            ref={timeRef}
            type="time"
            step={60}
            disabled={busy}
            aria-label="시각"
            className="w-32 rounded-control border border-border bg-surface-card px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20 disabled:bg-surface-muted disabled:text-sub"
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="mb-1 block text-xs text-sub">상담유형</label>
        <select
          name="consultation_type"
          required
          disabled={busy}
          defaultValue=""
          className="w-full rounded-control border border-border bg-surface-card px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20 disabled:bg-surface-muted disabled:text-sub"
        >
          <option value="" disabled>
            선택하세요
          </option>
          {CONSULT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <p className="mt-4 text-xs text-sub">채점에 1~2분 가량 소요됩니다. 완료될 때까지 이 화면을 벗어나지 마세요.</p>

      <button
        type="submit"
        disabled={busy}
        className="mt-4 w-full rounded-control bg-primary px-4 py-2 text-sm font-medium text-ink-inverse transition-colors hover:bg-primary-hover disabled:opacity-50"
      >
        {busy ? '채점 진행 중... (1~2분 가량 소요)' : '업로드 및 채점 실행'}
      </button>

      {error && <p className="mt-3 text-xs text-danger-text">{error}</p>}
    </form>
  );
}
