/**
 * types/next-auth.d.ts — NextAuth(Auth.js v5) 타입 확장(module augmentation).
 * users 계정의 커스텀 필드(username·display_name·role)를 User·Session·JWT에 싣기 위함.
 * (auth.ts authorize 반환값 → jwt 콜백 token → session 콜백 session.user 로 전파)
 */
import type { DefaultSession } from 'next-auth';
import type { UserRole } from '@/lib/db/userRepo';

declare module 'next-auth' {
  interface Session {
    user: {
      username: string;
      display_name: string;
      role: UserRole;
    } & DefaultSession['user'];
  }
  interface User {
    username: string;
    display_name: string;
    role: UserRole;
  }
}

// JWT 인터페이스의 실체는 @auth/core/jwt에 있고 next-auth/jwt는 이를 `export *`로
// 재노출만 한다. 재노출 모듈에 건 augmentation은 원본 인터페이스에 병합되지 않으므로
// (JWT는 Record<string, unknown> → token.username이 unknown으로 남음) 실체 모듈을 augment한다.
declare module '@auth/core/jwt' {
  interface JWT {
    username?: string;
    display_name?: string;
    role?: UserRole;
  }
}
