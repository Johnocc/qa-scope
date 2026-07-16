/**
 * 서버 컴포넌트에서 이 앱 자신의 /api 라우트를 fetch할 때 쓰는 공통 래퍼.
 * Next.js 서버 사이드 fetch는 상대경로를 못 받으므로 절대 URL을 구성한다.
 *
 * 엔진(스코어링)과 화면은 이 JSON API를 통해서만 대화한다 (CLAUDE.md §7.3) —
 * 그래서 lib/api는 lib/db를 직접 import하지 않고 항상 fetch로 API 라우트를
 * 거친다. 로컬에서 MySQL(docker compose)이 안 떠 있으면 라우트가 500을
 * 반환하는데, 각 lib/api/*.ts의 호출부가 이를 잡아 목업으로 대체한다.
 */

export function getBaseUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.APP_PORT ?? 3000}`;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * 인입 요청의 쿠키를 그대로 뽑아 내부 API fetch에 전달할 헤더를 만든다.
 *
 * 인증(feat/auth) 도입 후 필수: proxy.ts가 /api/*를 전부 잠그는데, SSR에서
 * 자기 API를 부르는 fetch에는 브라우저 세션 쿠키가 자동으로 실리지 않는다.
 * 전달하지 않으면 로그인한 사용자의 페이지 렌더조차 내부 401로 전멸한다.
 *
 * next/headers는 서버 전용 모듈이라 동적 import를 쓴다 — 이 파일은
 * ReviewPanel(클라이언트 컴포넌트) → lib/api/evaluations.ts 경유로 클라이언트
 * 번들에도 딸려 들어가므로, 정적 import를 걸면 클라이언트 빌드가 깨진다.
 */
async function buildAuthHeaders(): Promise<Record<string, string>> {
  if (typeof window !== 'undefined') return {}; // 브라우저는 쿠키 자동 첨부
  try {
    const { cookies } = await import('next/headers');
    const jar = await cookies();
    const cookie = jar
      .getAll()
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
    return cookie ? { cookie } : {};
  } catch {
    return {}; // 요청 컨텍스트 밖(스크립트 등) — 쿠키 없이 진행
  }
}

export async function fetchApi<T>(path: string): Promise<T> {
  const headers = await buildAuthHeaders();
  const res = await fetch(`${getBaseUrl()}${path}`, { cache: 'no-store', headers });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(body?.error ?? `요청 실패 (${res.status})`, res.status);
  }
  return body as T;
}
