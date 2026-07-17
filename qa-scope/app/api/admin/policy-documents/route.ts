/**
 * app/api/admin/policy-documents/route.ts — 약관 업로드·재색인 (POST)
 *
 * 접근 제어는 proxy.ts에서 처리(ADMIN 전용, 그 외 role은 403) — 이 라우트
 * 핸들러는 이미 ADMIN으로 통과된 요청만 받는다고 가정한다.
 *
 * 처리 순서(엄수 — 전환은 맨 마지막): 검증 → 색인 → 이력 저장 → 컬렉션 전환.
 * f~i 단계 실패는 try-catch 없이 그대로 throw한다(조용한 폴백 금지) —
 * 실패 시 rag_collection_name은 바뀌지 않으므로 라이브 검색은 기존 컬렉션을 계속 쓴다.
 */
import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { chunkPolicyText } from '@/lib/rag/chunk';
import { indexPolicyDocument } from '@/lib/rag/indexPolicy';
import { insert, list } from '@/lib/db/policyDocumentRepo';

// Vercel 함수 시간 상한 — 색인 25초 실측 × 여유
export const maxDuration = 120;

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

export async function GET() {
  const items = await list();

  // 프론트가 "현재 적용" 배지를 판정할 기준값. 미설정이면 throw(조용한 폴백 금지) —
  // rag_collection_name이 없다는 건 검색 파이프라인 자체가 이미 깨진 상태다.
  const activeCollectionName = await db.config.get('rag_collection_name');
  if (!activeCollectionName) {
    throw new Error('rag_collection_name 미설정 — app_config 확인 필요');
  }

  return NextResponse.json({ items, active_collection_name: activeCollectionName });
}

// "policy_" + YYYYMMDDHHmmss — Chroma 컬렉션명 규칙상 안전한 영숫자·언더스코어만 사용
function generateCollectionName(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    String(now.getFullYear()) +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds());
  return `policy_${stamp}`;
}

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: 'missing file', message: '파일을 첨부하세요' },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: 'file too large', message: '파일이 너무 큽니다. 2MB 이하만 지원' },
      { status: 400 },
    );
  }

  const content = await file.text();
  if (content.trim() === '') {
    return NextResponse.json(
      { error: 'empty content', message: '파일 내용이 비어 있습니다' },
      { status: 400 },
    );
  }

  const chunks = chunkPolicyText(content);
  if (chunks.length === 0) {
    return NextResponse.json(
      { error: 'unrecognized format', message: '약관 형식(제N조 단위)을 인식할 수 없습니다' },
      { status: 400 },
    );
  }

  const collectionName = generateCollectionName();

  const count = await indexPolicyDocument(content, collectionName);
  if (count !== chunks.length) {
    // 전환하지 않음(rag_collection_name 미변경) — 라이브 검색은 기존 컬렉션 유지
    throw new Error(
      `색인 개수 불일치: 사전검증 ${chunks.length}조각, 색인 후 ${count}개 (collection=${collectionName})`,
    );
  }

  await insert({
    filename: file.name,
    content,
    collectionName,
    chunkCount: count,
  });

  // 이 줄이 실행되는 순간부터 신규 컬렉션으로 전환
  await db.config.set('rag_collection_name', collectionName, '활성 RAG 컬렉션 (관리자 업로드)');

  return NextResponse.json({ collection_name: collectionName, chunk_count: count });
}
