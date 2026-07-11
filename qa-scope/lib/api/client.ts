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

export async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, { cache: 'no-store' });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(body?.error ?? `요청 실패 (${res.status})`, res.status);
  }
  return body as T;
}
