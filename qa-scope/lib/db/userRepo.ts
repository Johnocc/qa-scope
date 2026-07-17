/**
 * lib/db/userRepo.ts — users (로그인 계정) 접근
 *
 * 정본 계약: docs/db/로그인 설계문서 v1 20260716.md §3.
 * NextAuth(Auth.js) Credentials authorize()가 아이디로 계정을 찾을 때 쓴다.
 *
 * ⚠ 이 모듈은 mysql2를 쓰므로 **Node 런타임 전용**이다 — edge middleware에서
 *    import 금지 (auth.config.ts / middleware.ts는 이 파일을 참조하지 않는다).
 *    비밀번호 대조(bcrypt.compare)도 authorize()가 있는 Node route에서만 일어난다.
 */
import { query } from './pool';

export type UserRole = 'MANAGER' | 'ADMIN';

export interface UserRecord {
  id: number;
  username: string;
  password_hash: string;
  display_name: string;
  role: UserRole;
}

/** 로그인 ID로 계정 1건 조회. 없으면 null. */
export async function findByUsername(username: string): Promise<UserRecord | null> {
  const rows = await query<UserRecord>(
    'SELECT `id`, `username`, `password_hash`, `display_name`, `role` FROM `users` WHERE `username` = ? LIMIT 1',
    [username],
  );
  return rows[0] ?? null;
}

/**
 * 계정 upsert — 시드 스크립트(seed-user.ts)용. 이미 있으면 해시·표시명·role 갱신.
 * password_hash는 반드시 bcrypt 해시여야 한다(호출부 책임 — 여기서 해싱하지 않음).
 */
export async function upsertUser(
  username: string,
  passwordHash: string,
  displayName: string,
  role: UserRole,
): Promise<void> {
  await query(
    `INSERT INTO \`users\` (\`username\`, \`password_hash\`, \`display_name\`, \`role\`)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE \`password_hash\` = VALUES(\`password_hash\`),
                             \`display_name\`  = VALUES(\`display_name\`),
                             \`role\`          = VALUES(\`role\`)`,
    [username, passwordHash, displayName, role],
  );
}
