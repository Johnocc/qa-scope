/**
 * lib/db/policyDocumentRepo.ts — policy_documents (관리자 업로드 약관 문서) 접근
 *
 * 정본: scripts/schema.sql §6(★v8). 관리자 업로드 API(app/api/admin/policy-documents/route.ts)가
 * 색인 성공 후 이 모듈로 이력을 남긴다.
 */
import { pool } from './pool';
import type { ResultSetHeader } from 'mysql2/promise';

export interface PolicyDocumentInput {
  filename: string;
  content: string;
  collectionName: string;
  chunkCount: number;
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
