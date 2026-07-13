/**
 * lib/db/pool.ts — MySQL 커넥션 풀 + 트랜잭션 헬퍼
 *
 * 설계 노트
 *  - docker-compose가 주입하는 환경변수(DB_HOST 등)를 그대로 사용.
 *    Next.js 밖(스크립트)에서 쓸 때를 대비해 dotenv도 로드.
 *  - dateStrings: DATETIME을 JS Date로 변환하지 않고 'YYYY-MM-DD HH:MM:SS'
 *    문자열 그대로 받는다 (타임존 이중변환 사고 방지 — 서버 TZ=Asia/Seoul 전제).
 *  - decimalNumbers: DECIMAL(획득점수 2.5 등)을 문자열이 아닌 number로 수신.
 *  - ssl: 클라우드 MySQL(Aiven 등)은 TLS를 강제한다. DB_SSL_ENABLED=true일 때만
 *    켜지므로 로컬 docker-compose(평문)에는 영향 없음.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import mysql, { type Pool, type PoolConnection } from 'mysql2/promise';

/**
 * SSL 설정 조립. CA 인증서는 두 방식 중 하나로 주입:
 *  - DB_SSL_CA_PATH: PEM 파일 경로 (로컬/스크립트 실행용)
 *  - DB_SSL_CA: PEM 내용 자체 (Vercel 등 파일을 못 두는 환경용, "\n" 이스케이프 허용)
 * Aiven은 자체 CA를 쓰므로 CA 없이 rejectUnauthorized: true면 검증에 실패한다.
 */
function buildSslConfig() {
  if (process.env.DB_SSL_ENABLED !== 'true') return undefined;
  const ca = process.env.DB_SSL_CA_PATH
    ? readFileSync(process.env.DB_SSL_CA_PATH, 'utf-8')
    : process.env.DB_SSL_CA?.replace(/\\n/g, '\n');
  return {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
    ...(ca ? { ca } : {}),
  };
}

export const pool: Pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || 'qa_scope',
  user: process.env.DB_USER || 'qa_user',
  password: process.env.DB_PASSWORD || '',
  ssl: buildSslConfig(),
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  charset: 'utf8mb4_unicode_ci',
  dateStrings: true,
  decimalNumbers: true,
  namedPlaceholders: false,
});

/** 단건 쿼리 (풀에서 자동 획득/반납). 반환 타입은 호출부에서 지정 가능. */
export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

/**
 * 트랜잭션 래퍼.
 * 사용: await withTransaction(async (conn) => { ...conn.query(...) });
 * 콜백이 throw하면 자동 ROLLBACK, 정상 종료면 COMMIT.
 */
export async function withTransaction<T>(
  fn: (conn: PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
