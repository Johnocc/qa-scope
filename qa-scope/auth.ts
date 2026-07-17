/**
 * auth.ts — NextAuth(Auth.js v5) 전체 설정 (Node 런타임 전용)
 *
 * 정본 계약: docs/db/로그인 설계문서 v1 20260716.md.
 *
 * 여기에만 Credentials authorize 실구현(mysql2 조회 + bcrypt 대조 + 시도제한)이 있다.
 * export:
 *   - handlers : app/api/auth/[...nextauth]/route.ts 가 GET/POST로 재노출
 *   - auth     : Server Component/Route Handler에서 세션 조회 + auth() 래퍼
 *   - signIn / signOut : 서버 액션·로그아웃 버튼용
 *
 * 실패 정책(설계문서 §5):
 *   - 아이디/비밀번호 불일치 → null 반환 → 화면은 단일 문구
 *     "아이디 또는 비밀번호가 올바르지 않습니다" (어느 쪽이 틀렸는지 미노출).
 *   - 시도 제한 발동 → RateLimitError(code='RateLimited') throw
 *     → 화면은 "잠시 후 다시 시도해 주세요" 로 매핑(남은 시간 미표기).
 */
import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import authConfig from './auth.config';
import { findByUsername } from '@/lib/db/userRepo';
import { isRateLimited, recordFailure, recordSuccess } from '@/lib/auth/rateLimit';

/** 시도 제한 발동 시 던지는 에러. code는 로그인 화면이 문구로 매핑(설계문서 §6 확정 B). */
class RateLimitError extends CredentialsSignin {
  code = 'RateLimited';
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: 'Username' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const username = String(credentials?.username ?? '').trim();
        const password = String(credentials?.password ?? '');
        if (!username || !password) return null;

        // 시도 제한: 차단 중이면 대조 전에 거부(bcrypt 낭비·타이밍 노출 방지).
        if (isRateLimited(username)) throw new RateLimitError();

        const user = await findByUsername(username);
        if (!user) {
          // 존재하지 않는 계정도 실패로 집계(무차별 대입 억제) — 화면 문구는 동일.
          recordFailure(username);
          return null;
        }

        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) {
          recordFailure(username);
          return null;
        }

        recordSuccess(username); // 성공 시 카운터 초기화
        return {
          id: String(user.id),
          username: user.username,
          display_name: user.display_name,
          role: user.role,
        };
      },
    }),
  ],
});
