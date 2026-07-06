/**
 * scripts/apply-schema.js — scripts/schema.sql 을 MySQL에 적용.
 *
 * docker compose 는 최초 기동 시 schema.sql 을 자동 실행하지만,
 * 그건 "DB 볼륨이 빈 상태일 때만" 동작한다.
 * 스키마를 고친 뒤 다시 적용하려면 두 가지 방법 중 하나:
 *   (A) docker compose down -v 로 볼륨 삭제 후 재기동 (데이터도 사라짐)
 *   (B) 이 스크립트로 이어붙여 적용:  npm run db:schema
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true, // 스키마 파일은 여러 구문 → 허용
  });
  await conn.query(sql);
  await conn.end();
  console.log('[db:schema] schema.sql 적용 완료');
}

main().catch((err) => {
  console.error('[db:schema] 실패:', err.message);
  process.exit(1);
});
