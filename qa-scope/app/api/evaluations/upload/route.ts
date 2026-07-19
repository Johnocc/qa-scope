/**
 * app/api/evaluations/upload/route.ts — 상담 텍스트 업로드 → 채점 실행 (POST)
 *
 * 접근 제어는 proxy.ts에서 처리 — MANAGER만 /api/evaluations/* 통과, ADMIN은
 * 이미 403으로 차단된다(별도 권한 검사 불필요).
 *
 * 처리 순서(엄수): 검증 다층(a~g) → consultation_code 서버 생성 →
 * scoreConsultation()(내부에서 DB 저장까지 완료) → 성공 응답.
 * 실패 시 정합성 정책 = B안(계약 확정) — persistEvaluation 내부에서
 * 상담 행만 커밋되고 평가 저장에서 실패하는 반쪽 상태를 트랜잭션으로
 * 막지 않는 대신, 실패 응답에 생성된 상담코드를 항상 명시해 조용히
 * 묻히지 않게 한다. 재시도는 상담코드가 매번 새로 생성되므로 막히지 않는다.
 */
import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { parseTranscript } from '@/lib/scoring/parse';
import { scoreConsultation } from '@/lib/scoring/pipeline';
import { CONSULT_TYPES } from '@/lib/scoring/constants';
import { listAgents } from '@/lib/db/agentRepo';
import { findConsultation } from '@/lib/db/consultationRepo';
import { query } from '@/lib/db/pool';

// 실측(zz_timing_test, 2026-07-18): 약 62초(LLM 37s + DB저장 25s) × 2배+ 여유
export const maxDuration = 300;

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB
const DROPPED_LINE_RATIO_LIMIT = 0.5; // 인식 실패 줄이 전체의 50% 초과 시 거부

const MAX_AUDIO_SIZE = 3.5 * 1024 * 1024; // 3.5MB — 음성 파일(선택) 상한, MAX_FILE_SIZE와 별개
const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.wav'];

// "UP-" + YYYYMMDDHHmmss + "-" + 4자리 랜덤 — 대외 상담코드와 형식으로 구분(약관업로드의 policy_타임스탬프와 동일 원칙)
function generateConsultationCode(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    String(now.getFullYear()) +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds());
  const rand = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `UP-${stamp}-${rand}`;
}

// datetime-local(<input type="datetime-local">) 값 "YYYY-MM-DDTHH:mm"을 그대로
// 'YYYY-MM-DD HH:mm:00'으로 치환한다 — Date 객체를 거치지 않아 타임존 이중변환
// 문제가 생기지 않는다(pool.ts의 동일 원칙 — 벽시계 문자열을 그대로 취급).
const DATETIME_LOCAL_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:\d{2})?$/;
function toSqlDatetimeFromLocalInput(raw: string): string | null {
  const m = raw.match(DATETIME_LOCAL_PATTERN);
  if (!m) return null;
  const seconds = m[3] ? m[3] : ':00';
  return `${m[1]} ${m[2]}${seconds}`;
}

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);

  // a. 파일 존재
  const file = formData?.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'missing file', message: '파일을 첨부하세요' }, { status: 400 });
  }

  // a-1. 확장자 — .txt만 허용(대소문자 무관)
  if (!file.name.toLowerCase().endsWith('.txt')) {
    return NextResponse.json(
      { error: 'invalid file type', message: '.txt 파일만 업로드할 수 있습니다' },
      { status: 400 },
    );
  }

  // b. 파일 크기 상한
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: 'file too large', message: '파일이 너무 큽니다. 1MB 이하만 지원' },
      { status: 400 },
    );
  }

  // c. 상담사 선택 — 실존 여부까지 확인(FK 원시 에러로 새지 않게)
  const agentId = formData?.get('agent_id');
  if (typeof agentId !== 'string' || agentId.trim() === '') {
    return NextResponse.json({ error: 'missing agent', message: '상담사를 선택하세요' }, { status: 400 });
  }
  const agents = await listAgents({ activeOnly: true });
  if (!agents.some((a) => a.agent_id === agentId)) {
    return NextResponse.json({ error: 'invalid agent', message: '알 수 없는 상담사입니다' }, { status: 400 });
  }

  // d. 상담일시
  const consultedAtRaw = formData?.get('consulted_at');
  if (typeof consultedAtRaw !== 'string' || consultedAtRaw.trim() === '') {
    return NextResponse.json({ error: 'missing consulted_at', message: '상담일시를 입력하세요' }, { status: 400 });
  }
  const consultedAt = toSqlDatetimeFromLocalInput(consultedAtRaw.trim());
  if (consultedAt === null) {
    return NextResponse.json(
      { error: 'invalid consulted_at', message: '상담일시 형식이 올바르지 않습니다' },
      { status: 400 },
    );
  }

  // e. 상담유형
  const consultationType = formData?.get('consultation_type');
  if (typeof consultationType !== 'string' || !(CONSULT_TYPES as readonly string[]).includes(consultationType)) {
    return NextResponse.json(
      { error: 'invalid consultation_type', message: '상담유형을 선택하세요' },
      { status: 400 },
    );
  }

  const content = await file.text();
  if (content.trim() === '') {
    return NextResponse.json({ error: 'empty content', message: '파일 내용이 비어 있습니다' }, { status: 400 });
  }

  // f. 형식 파싱 사전 검증
  const { utterances, droppedLines } = parseTranscript(content);
  if (utterances.length === 0) {
    return NextResponse.json(
      { error: 'unrecognized format', message: '상담 형식([HH:MM] 화자: 내용)을 인식할 수 없습니다' },
      { status: 400 },
    );
  }
  const totalLines = utterances.length + droppedLines.length;
  if (droppedLines.length / totalLines > DROPPED_LINE_RATIO_LIMIT) {
    return NextResponse.json(
      {
        error: 'too many unrecognized lines',
        message: `인식하지 못한 줄이 전체의 절반을 넘습니다(${droppedLines.length}/${totalLines}줄) — 파일 형식을 확인하세요`,
      },
      { status: 400 },
    );
  }

  // g. 상담코드 중복 사전조회 (서버 생성값이라 충돌 극히 희박 — DB UNIQUE가 최종 안전망)
  const consultationCode = generateConsultationCode();
  const dup = await findConsultation(consultationCode);
  if (dup) {
    return NextResponse.json(
      { error: 'duplicate', message: '상담코드 생성이 충돌했습니다. 다시 시도하세요' },
      { status: 409 },
    );
  }

  // h. 음성 파일(선택) — 있으면 채점 시작 전에 검증. 없으면(null) 아래 로직 전부 no-op이라
  //    기존 텍스트 전용 업로드 흐름은 한 글자도 안 바뀐다.
  const audioField = formData?.get('audio');
  const hasAudio = audioField instanceof File && audioField.size > 0;
  const audioFile = hasAudio ? (audioField as File) : null;
  let audioExt: string | null = null;
  if (audioFile) {
    audioExt = AUDIO_EXTENSIONS.find((e) => audioFile.name.toLowerCase().endsWith(e)) ?? null;
    if (!audioExt) {
      return NextResponse.json(
        { error: 'invalid audio type', message: '.mp3, .m4a, .wav 파일만 업로드할 수 있습니다' },
        { status: 400 },
      );
    }
    if (audioFile.size > MAX_AUDIO_SIZE) {
      return NextResponse.json(
        { error: 'audio too large', message: '음성 파일이 너무 큽니다. 3.5MB 이하만 지원' },
        { status: 400 },
      );
    }
  }

  try {
    let unmatchedQuoteCount = 0;
    let evaluationId: number | null = null;
    let consultationId: number | null = null;
    const result = await scoreConsultation(consultationCode, content, {
      agentId,
      consultedAt,
      consultationType,
      logVerification: true,
      onPersisted: (persisted) => {
        unmatchedQuoteCount = persisted.unmatchedQuotes.length;
        evaluationId = persisted.evaluationId;
        consultationId = persisted.consultationId;
      },
    });

    // 음성 파일(선택) — 채점 성공 후 Blob 업로드 + audio_url UPDATE.
    // 실패해도 채점 결과 저장 자체는 그대로 유지한다(전체 실패로 번지지 않게).
    let audioSaved = false;
    if (audioFile && audioExt) {
      try {
        const blob = await put(`audio/${consultationCode}${audioExt}`, audioFile, { access: 'public' });
        await query('UPDATE `consultation_master` SET `audio_url` = ? WHERE `consultation_id` = ?', [
          blob.url,
          consultationId,
        ]);
        audioSaved = true;
      } catch (err) {
        console.error('[upload] 음성 저장 실패:', err);
      }
    }

    return NextResponse.json({
      consultation_code: consultationCode,
      evaluation_id: evaluationId,
      final_score: result.집계.환산총점,
      status_label: result.집계.상태라벨,
      risk_flagged: result.집계.위험표시여부,
      dropped_lines: droppedLines.length,
      unmatched_quotes: unmatchedQuoteCount,
      ...(hasAudio ? { audio_saved: audioSaved } : {}),
    });
  } catch (err) {
    // Vercel 로그에 스택트레이스가 남도록 err 객체 전체를 넘긴다(message만 추출 금지).
    console.error('[upload] 채점 처리 실패:', err);
    // B안: 상담 행만 커밋되고 평가 저장이 실패했을 수 있는 반쪽 상태를
    // 조용히 숨기지 않는다 — 생성된 상담코드를 항상 응답에 명시.
    return NextResponse.json(
      {
        error: 'scoring failed',
        message: `채점 처리 중 오류가 발생했습니다. 상담코드(${consultationCode})로 상담 레코드가 부분 생성됐을 수 있습니다 — 관리자에게 문의하거나 다시 시도하세요.`,
        consultation_code: consultationCode,
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
