/**
 * scripts/seed-user.ts — 로그인 계정 시드 (매니저 1건 + 관리자 1건)
 *
 * 정본 계약: docs/db/로그인 설계문서 v1 20260716.md §3
 *            + 보완사항 20260716 [D 확정] — 시드 비밀번호는 환경변수에서 읽어
 *            bcrypt 해시 후 저장. 변수 없으면 에러로 중단(기본값 폴백 금지).
 *            이 변수들은 Vercel에는 넣지 않는다(시드 실행 시에만 필요).
 *
 * 사용:
 *   SEED_MANAGER_PASSWORD=... SEED_ADMIN_PASSWORD=... npm run db:seed-user
 *   (또는 .env에 두 변수를 넣고) npm run db:seed-user
 *
 * 동작:
 *   env에서 비밀번호를 읽어 bcrypt 해시로 변환 후 users 테이블에 upsert.
 *   이미 있으면 해시·표시명·role만 갱신(비밀번호 재설정 용도로 재실행 안전).
 *   매니저·관리자 두 계정 모두 준비돼야 시드한다 — 하나라도 비밀번호
 *   환경변수가 없으면 아무것도 쓰지 않고 중단(반쪽 시드 금지).
 *
 * ⚠ 평문 비밀번호를 코드/스키마에 하드코딩하지 않는다 (설계문서 §3·§13,
 *    70컷 하드코딩 금지와 같은 원칙).
 *
 * env:
 *   SEED_MANAGER_USERNAME     매니저 계정 로그인 ID (기본 'qa_manager')
 *   SEED_MANAGER_PASSWORD     매니저 계정 비밀번호 (필수 — 없으면 중단, 폴백 금지)
 *   SEED_MANAGER_DISPLAY_NAME 매니저 계정 표시명 (기본 'QA 매니저')
 *   SEED_ADMIN_PASSWORD       관리자 계정 비밀번호 (필수 — 없으면 중단, 폴백 금지)
 *   BCRYPT_SALT_ROUNDS        (기본 10)
 *
 * 관리자 계정(username='admin', display_name='관리자', role='ADMIN')은
 * 하드코딩 — 매니저처럼 이름을 바꿔 여러 개 만드는 대상이 아니라 단일 슬롯.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { upsertUser } from '../lib/db/userRepo.ts';
import { pool } from '../lib/db/pool.ts';

async function main() {
  const managerUsername = (process.env.SEED_MANAGER_USERNAME || 'qa_manager').trim();
  const managerPassword = process.env.SEED_MANAGER_PASSWORD;
  const managerDisplayName = (process.env.SEED_MANAGER_DISPLAY_NAME || 'QA 매니저').trim();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS || 10);

  if (!managerPassword || !adminPassword) {
    console.error(
      '[db:seed-user] 실패: SEED_MANAGER_PASSWORD 또는 SEED_ADMIN_PASSWORD 환경변수가 없습니다.\n' +
        '  평문 비밀번호 하드코딩 금지 원칙(폴백 금지 — 보완사항 [D 확정])에 따라\n' +
        '  비밀번호는 env로만 공급하며, 두 계정 모두 준비돼야 시드합니다(반쪽 시드 금지).\n' +
        '  예) SEED_MANAGER_PASSWORD=... SEED_ADMIN_PASSWORD=... npm run db:seed-user',
    );
    process.exit(1);
  }

  const managerPasswordHash = await bcrypt.hash(managerPassword, saltRounds);
  await upsertUser(managerUsername, managerPasswordHash, managerDisplayName, 'MANAGER');
  console.log(
    `[db:seed-user] 계정 시드 완료 — username='${managerUsername}', display_name='${managerDisplayName}', role='MANAGER'`,
  );

  const adminPasswordHash = await bcrypt.hash(adminPassword, saltRounds);
  await upsertUser('admin', adminPasswordHash, '관리자', 'ADMIN');
  console.log(`[db:seed-user] 계정 시드 완료 — username='admin', display_name='관리자', role='ADMIN'`);
}

main()
  .catch((err) => {
    console.error('[db:seed-user] 실패:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
