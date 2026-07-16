/**
 * lib/db/pool.ts — MySQL 커넥션 풀 + 트랜잭션 헬퍼
 *
 * 설계 노트
 *  - docker-compose가 주입하는 환경변수(DB_HOST 등)를 그대로 사용.
 *    Next.js 밖(스크립트)에서 쓸 때를 대비해 dotenv도 로드.
 *  - dateStrings: DATETIME을 JS Date로 변환하지 않고 'YYYY-MM-DD HH:MM:SS'
 *    문자열 그대로 받는다 (타임존 이중변환 사고 방지).
 *  - 세션 time_zone을 커넥션마다 DB_TIME_ZONE(기본 +09:00)으로 고정한다.
 *    클라우드 MySQL(Aiven 등)은 서버 기본이 UTC라, 이걸 안 하면
 *    NOW()/DEFAULT CURRENT_TIMESTAMP가 UTC 벽시계로 DATETIME에 박힌다.
 *  - decimalNumbers: DECIMAL(획득점수 2.5 등)을 문자열이 아닌 number로 수신.
 *  - ssl: 클라우드 MySQL(Aiven 등)은 TLS를 강제한다. DB_SSL_ENABLED=true일 때만
 *    켜지므로 로컬 docker-compose(평문)에는 영향 없음.
 *  - 죽은 연결 방어(원격 DB 대응): Aiven 등은 유휴 연결을 서버가 끊는데, 풀이
 *    그걸 모르고 죽은 연결을 재사용하면 산발적 ECONNRESET이 난다(로컬 Docker는
 *    안 끊어 안 보이던 문제). 두 겹으로 막는다:
 *      ① enableKeepAlive + idleTimeout — 연결을 살아있게 유지하고, 서버가
 *         끊기 전에 풀이 유휴 연결을 먼저 폐기(idleTimeout < 서버 wait_timeout).
 *      ② query/withTransaction의 죽은 연결 1회 재시도 — 그래도 잡힌 죽은 연결은
 *         새 연결로 자동 재시도해 "다시 하면 됨" 증상을 코드가 흡수한다.
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
  // 죽은 연결 방어 ① — 원격 DB(Aiven 등)가 유휴 연결을 회수하기 전에 대응.
  //  - enableKeepAlive: TCP keepalive로 네트워크(프록시·NAT) 유휴 절단을 막는다.
  //  - idleTimeout: 풀이 유휴 연결을 이 시간 뒤 스스로 폐기 → 서버 wait_timeout보다
  //    짧게 잡아, 서버가 끊은 죽은 연결을 애초에 재사용하지 않게 한다.
  //    (로컬 Docker엔 영향 거의 없음 — 유휴 연결을 안 끊으므로.)
  enableKeepAlive: true,
  keepAliveInitialDelay: Number(process.env.DB_KEEPALIVE_DELAY_MS || 10000),
  idleTimeout: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
  charset: 'utf8mb4_unicode_ci',
  dateStrings: true,
  decimalNumbers: true,
  namedPlaceholders: false,
});

// 새 커넥션이 풀에 들어올 때마다 세션 타임존 고정.
// 'connection' 핸들러의 쿼리는 그 커넥션의 큐 맨 앞에 서므로
// 이후 사용자 쿼리보다 항상 먼저 실행된다.
const DB_TIME_ZONE = process.env.DB_TIME_ZONE || '+09:00';
pool.on('connection', (conn) => {
  conn.query('SET time_zone = ?', [DB_TIME_ZONE]);
});

/**
 * 죽은 연결 방어 ② — 원격 DB가 유휴 연결을 끊어 생긴 "죽은 연결" 에러인지 판별.
 * 이런 에러는 연결이 이미 끊긴 상태라 쿼리가 서버에 닿기 전에 실패한다 →
 * 새 연결로 1회 재시도하면 성공한다("다시 하면 됨" 증상). fatal 플래그 또는
 * 아래 코드면 재시도 대상. (문법 오류·제약 위반 등 정상 에러는 재시도하지 않음)
 */
const DEAD_CONNECTION_CODES = new Set([
  'PROTOCOL_CONNECTION_LOST',
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
  'CONN_CLOSED',
]);
function isDeadConnectionError(err: unknown): boolean {
  const e = err as { code?: string; fatal?: boolean } | null;
  return !!e && (e.fatal === true || (typeof e.code === 'string' && DEAD_CONNECTION_CODES.has(e.code)));
}

/** 단건 쿼리 (풀에서 자동 획득/반납). 죽은 연결이면 새 연결로 1회 재시도. */
export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      const [rows] = await pool.query(sql, params);
      return rows as T[];
    } catch (err) {
      // 죽은 연결은 서버에 닿기 전 실패라 재시도가 안전(중복 실행 위험 없음).
      if (attempt === 0 && isDeadConnectionError(err)) continue;
      throw err;
    }
  }
}

/**
 * 트랜잭션 래퍼.
 * 사용: await withTransaction(async (conn) => { ...conn.query(...) });
 * 콜백이 throw하면 자동 ROLLBACK, 정상 종료면 COMMIT.
 *
 * 죽은 연결 방어 ②: 연결 확보~트랜잭션 시작 단계에서만 1회 재시도한다.
 * 이 단계의 죽은 연결은 아직 아무 구문도 실행되지 않았으므로 재시도가 안전하다.
 * 트랜잭션 본문(fn)/commit이 시작된 뒤의 실패는 부분 실행·커밋 모호성 때문에
 * 재시도하지 않고 그대로 올린다(중복 저장 방지).
 */
export async function withTransaction<T>(
  fn: (conn: PoolConnection) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let conn: PoolConnection;
    try {
      conn = await pool.getConnection();
    } catch (err) {
      if (attempt === 0 && isDeadConnectionError(err)) continue;
      throw err;
    }
    try {
      await conn.beginTransaction();
    } catch (err) {
      conn.release(); // 확보한 연결 반납 후 재시도(아직 트랜잭션 미시작 — 안전)
      if (attempt === 0 && isDeadConnectionError(err)) continue;
      throw err;
    }
    // 여기부터는 트랜잭션 본문 — 재시도하지 않는다.
    try {
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      try {
        await conn.rollback();
      } catch {
        /* 죽은 연결이면 rollback도 실패 — 무시(연결은 아래 release에서 폐기) */
      }
      throw err;
    } finally {
      conn.release();
    }
  }
}
