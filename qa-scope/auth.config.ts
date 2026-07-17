/**
 * auth.config.ts — NextAuth(Auth.js v5) 공통 설정 (edge/proxy-safe subset)
 *
 * 정본 계약: docs/db/로그인 설계문서 v1 20260716.md.
 *
 * 이 파일에는 DB·bcrypt 등 Node 전용 코드를 두지 않는다.
 *  - proxy.ts가 이 config로 별도 NextAuth 인스턴스를 만들어 매 요청의 JWT를 검증한다.
 *  - Credentials provider의 실제 대조 로직(authorize: bcrypt·mysql2)은 auth.ts에만 둔다.
 * (Next.js 16부터 proxy는 Node 런타임이라 이 분리가 런타임 필수는 아니지만,
 *  매 요청 경계 파일에 DB/bcrypt import 그래프를 끌고 들어가지 않는 관심사 분리 —
 *  설계문서 §2 및 CLAUDE.md "단순·검증 가능한 로직" 원칙.)
 */
import type { NextAuthConfig } from 'next-auth';

const EIGHT_HOURS_SEC = 8 * 60 * 60; // 설계문서 §1-4: JWT 세션 만료 8시간

// secret 미설정 시 조용히 fail-open(잠금 무력화)되는 것을 방지 — 기동 자체를 막는다.
// (proxy.ts·auth.ts 양쪽이 이 파일을 import하므로 여기 한 곳이면 서버·미들웨어 모두 커버)
const secret = process.env.NEXTAUTH_SECRET;
if (!secret) {
  throw new Error(
    '[auth] NEXTAUTH_SECRET 미설정 — 인증 잠금이 무력화되므로 기동을 중단합니다. ' +
    '.env(로컬) 또는 Vercel 환경변수에 NEXTAUTH_SECRET을 설정하세요.'
  );
}

export default {
  // 프록시(리버스 프록시·Vercel·Docker) 뒤에서 Host 헤더를 신뢰. 없으면 self-host/
  // 로컬 `next start`에서 UntrustedHost로 세션 검증이 실패(→ 프록시 가드 fail-open,
  // /api/auth/* 500). Vercel은 자동 감지되지만 Docker·로컬을 위해 명시한다.
  // (env AUTH_TRUST_HOST=true 로도 동일 효과)
  trustHost: true,
  secret,
  // provider 실구현(bcrypt·DB)은 auth.ts에서 주입. 여기선 비워 둔다(edge-safe).
  providers: [],
  // 설계문서 §1-4: DB 세션 테이블 없이 서명된 JWT 쿠키로 세션 유지.
  session: { strategy: 'jwt', maxAge: EIGHT_HOURS_SEC },
  // 미인증 시 이동할 로그인 화면(민재 담당). proxy.ts도 이 경로로 리다이렉트.
  pages: { signIn: '/login' },
  callbacks: {
    // 로그인 시점의 user(→authorize 반환값)를 토큰에 실어, 이후 요청에서 DB 조회 없이 사용.
    jwt({ token, user }) {
      if (user) {
        token.username = user.username;
        token.display_name = user.display_name;
        token.role = user.role;
      }
      return token;
    },
    // 토큰의 커스텀 필드를 세션에 노출(헤더 "OOO님"·검수자 자동기입 등에서 사용).
    session({ session, token }) {
      if (session.user) {
        if (token.username) session.user.username = token.username;
        if (token.display_name) session.user.display_name = token.display_name;
        if (token.role) session.user.role = token.role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
