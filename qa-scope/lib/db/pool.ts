/**
 * lib/db/pool.ts — MySQL 커넥션 풀 + 트랜잭션 헬퍼
 *
 * 설계 노트
 *  - docker-compose가 주입하는 환경변수(DB_HOST 등)를 그대로 사용.
 *    Next.js 밖(스크립트)에서 쓸 때를 대비해 dotenv도 로드.
 *  - dateStrings: DATETIME을 JS Date로 변환하지 않고 'YYYY-MM-DD HH:MM:SS'
 *    문자열 그대로 받는다 (타임존 이중변환 사고 방지 — 서버 TZ=Asia/Seoul 전제).
 *  - decimalNumbers: DECIMAL(획득점수 2.5 등)을 문자열이 아닌 number로 수신.
 */
import 'dotenv/config';
import mysql, { type Pool, type PoolConnection } from 'mysql2/promise';

export const pool: Pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || 'qa_scope',
  user: process.env.DB_USER || 'qa_user',
  password: process.env.DB_PASSWORD || '',
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
