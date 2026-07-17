/**
 * lib/db/policyDocumentRepo.ts — policy_documents (관리자 업로드 약관 문서) 접근
 *
 * 정본: scripts/schema.sql §6(★v8). 관리자 업로드 API(app/api/admin/policy-documents/route.ts)가
 * 색인 성공 후 이 모듈로 이력을 남긴다.
 */
import { pool, query } from './pool';
import type { ResultSetHeader } from 'mysql2/promise';

export interface PolicyDocumentInput {
  filename: string;
  content: string;
  collectionName: string;
  chunkCount: number;
}

/** GET 목록(관리자 화면)용 — content는 제외하고 길이만 포함. */
export interface PolicyDocumentListItem {
  id: number;
  filename: string;
  collection_name: string;
  chunk_count: number;
  created_at: string;
  content_length: number;
}

/**
 * 업로드·색인 이력 저장.
 * @returns 신규 행의 insertId
 */
export async function insert(input: PolicyDocumentInput): Promise<number> {
  const [res] = await pool.query<ResultSetHeader>(
    `INSERT INTO \`policy_documents\` (\`filename\`, \`content\`, \`collection_name\`, \`chunk_count\`)
     VALUES (?, ?, ?, ?)`,
    [input.filename, input.content, input.collectionName, input.chunkCount],
  );
  return res.insertId;
}

/** 업로드 이력 전체 목록 — 최신순. content는 무거워 제외하고 길이만 반환. */
export async function list(): Promise<PolicyDocumentListItem[]> {
  return query<PolicyDocumentListItem>(
    `SELECT \`id\`, \`filename\`, \`collection_name\`, \`chunk_count\`, \`created_at\`,
            LENGTH(\`content\`) AS \`content_length\`
     FROM \`policy_documents\`
     ORDER BY \`id\` DESC`,
  );
}
