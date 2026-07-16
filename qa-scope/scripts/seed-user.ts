/**
 * scripts/seed-user.ts — 로그인 계정 시드 (qa_manager 1건)
 *
 * 정본 계약: docs/db/로그인 설계문서 v1 20260716.md §3
 *            + 보완사항 20260716 [D 확정] — 시드 비밀번호는 SEED_ADMIN_PASSWORD
 *            환경변수에서 읽어 bcrypt 해시 후 저장. 변수 없으면 에러로 중단
 *            (기본값 폴백 금지). 이 변수는 Vercel에는 넣지 않는다(시드 실행 시에만 필요).
 *
 * 사용:
 *   SEED_ADMIN_PASSWORD=... npm run db:seed-user
 *   (또는 .env에 SEED_ADMIN_PASSWORD 를 넣고) npm run db:seed-user
 *
 * 동작:
 *   env에서 비밀번호를 읽어 bcrypt 해시로 변환 후 users 테이블에 upsert.
 *   이미 있으면 해시·표시명만 갱신(비밀번호 재설정 용도로 재실행 안전).
 *
 * ⚠ 평문 비밀번호를 코드/스키마에 하드코딩하지 않는다 (설계문서 §3·§13,
 *    70컷 하드코딩 금지와 같은 원칙).
 *
 * env:
 *   SEED_ADMIN_USERNAME     (기본 'qa_manager')
 *   SEED_ADMIN_PASSWORD     (필수 — 없으면 중단, 폴백 금지)
 *   SEED_ADMIN_DISPLAY_NAME (기본 'QA 매니저')
 *   BCRYPT_SALT_ROUNDS      (기본 10)
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { upsertUser } from '../lib/db/userRepo.ts';
import { pool } from '../lib/db/pool.ts';

async function main() {
  const username = (process.env.SEED_ADMIN_USERNAME || 'qa_manager').trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const displayName = (process.env.SEED_ADMIN_DISPLAY_NAME || 'QA 매니저').trim();
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS || 10);

  if (!password) {
    console.error(
      '[db:seed-user] 실패: SEED_ADMIN_PASSWORD 환경변수가 없습니다.\n' +
        '  평문 비밀번호 하드코딩 금지 원칙(폴백 금지 — 보완사항 [D 확정])에 따라\n' +
        '  비밀번호는 env로만 공급합니다.\n' +
        '  예) SEED_ADMIN_PASSWORD=... npm run db:seed-user',
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, saltRounds);
  await upsertUser(username, passwordHash, displayName);

  console.log(`[db:seed-user] 계정 시드 완료 — username='${username}', display_name='${displayName}'`);
}

main()
  .catch((err) => {
    console.error('[db:seed-user] 실패:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
