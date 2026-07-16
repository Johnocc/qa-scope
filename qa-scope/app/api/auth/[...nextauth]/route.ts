/**
 * app/api/auth/[...nextauth]/route.ts — NextAuth(Auth.js v5) 자체 엔드포인트.
 * signin/signout/session/csrf 등을 처리한다. proxy.ts matcher에서 예외로 열려 있어야
 * 로그인이 가능(설계문서 §4).
 */
import { handlers } from '@/auth';

export const { GET, POST } = handlers;
