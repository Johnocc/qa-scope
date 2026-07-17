/**
 * proxy.ts — 요청 경계 인증 가드 (Next.js 16 규약)
 *
 * ※ Next.js 16부터 `middleware.ts`가 `proxy.ts`로 이름 변경되었고 기본 Node 런타임에서
 *    실행된다(둘 다 있으면 빌드 에러). 설계문서 §2·§4의 "middleware.ts"가 가리키는
 *    바로 그 세션 가드 레이어다 — 개념 동일, 파일명만 프레임워크 규약을 따른다.
 *
 * 정본 계약: docs/db/로그인 설계문서 v1 20260716.md §4
 *            + 보완사항 20260716 [A 확정] — /api/* 전체(health 포함) 잠금.
 *   원칙: 화면 4개 + /api/* 전부 잠근다("화면만 막고 API는 뚫린" 구멍 방지).
 *   - 미인증 + 화면 라우트  → /login 리다이렉트(callbackUrl로 원래 목적지 보존)
 *   - 미인증 + /api/*        → 401 JSON (리다이렉트 HTML을 주지 않는다)
 *   예외(matcher에서 제외 → 가드 미적용): /login, /api/auth/*(NextAuth 자체),
 *     정적 자산(_next/*, favicon, 확장자 파일)뿐. /api/health도 잠근다 —
 *     docker-compose 헬스체크는 mysql 컨테이너(mysqladmin)만 있고 app은
 *     /api/health를 자동 호출하지 않음을 실사로 확인(잠가도 깨지는 것 없음).
 *
 * auth.config(edge-safe)로 만든 인스턴스라 매 요청에서 JWT 검증만 하고,
 * bcrypt/mysql2(authorize)는 절대 실행하지 않는다.
 */
import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import authConfig from './auth.config';

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname, search } = req.nextUrl;

  if (req.auth) {
    // 역할 완전 분리(B안) — ADMIN은 /admin만, MANAGER는 화면①~④만 (20260718 확정)
    const role = req.auth.user.role;

    if (role !== 'ADMIN' && pathname.startsWith('/admin')) {
      return NextResponse.redirect(new URL('/evaluations', req.url));
    }

    if (role === 'ADMIN') {
      if (pathname.startsWith('/evaluations') || pathname.startsWith('/agents')) {
        return NextResponse.redirect(new URL('/admin', req.url));
      }
      if (pathname.startsWith('/api/evaluations') || pathname.startsWith('/api/agents')) {
        return NextResponse.json(
          { error: 'forbidden', message: '권한 없음' },
          { status: 403 },
        );
      }
    }

    return; // 통과
  }

  // API는 리다이렉트가 아니라 401 (호출부가 HTML 로그인 페이지를 받으면 안 됨).
  if (pathname.startsWith('/api')) {
    return NextResponse.json(
      { error: 'unauthorized', message: '인증이 필요합니다.' },
      { status: 401 },
    );
  }

  // 화면은 로그인으로 유도하고, 로그인 후 원래 가려던 경로로 돌아오게 callbackUrl 부착.
  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('callbackUrl', pathname + search);
  return NextResponse.redirect(loginUrl);
});

export const config = {
  // 제외 목록 = 로그인 가능 최소 경로 + 정적 자산. 그 외 전부 가드 통과.
  // (보완사항 [A 확정]: /api/health 예외 없음 — /api/*는 전부 401 잠금)
  matcher: ['/((?!login|api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
