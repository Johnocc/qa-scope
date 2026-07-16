/**
 * lib/auth/rateLimit.ts — 로그인 시도 제한 (시간창 방식)
 *
 * 정본 계약: docs/db/로그인 설계문서 v1 20260716.md §6 확정 B (2026-07-16, John).
 *  - 같은 계정 연속 5회 실패 → 5분간 시도 거부 → 자동 해제.
 *  - 계정 잠금(lock)은 채택 안 함 — 관리자 해제 없이 5분 뒤 자동 복구(시연 안전).
 *  - 저장: 서버 메모리(Map). DB 테이블 불필요, 서버 재시작 시 초기화(데모 규모에 충분).
 *  - 남은 시간은 노출하지 않는다 — 공격자에게 정보 최소화(문구는 authorize에서 처리).
 *
 * ⚠ Node 런타임 전용 — NextAuth Credentials authorize()(Node route)에서만 호출한다.
 *    edge middleware에서 import 금지(메모리 상태가 인스턴스별로 갈려 무의미).
 *
 * 임계값은 설정 외부화 원칙(설계문서 §12·§13)에 따라 env로 조정 가능(기본 5회/5분).
 */

const MAX_FAILURES = Number(process.env.AUTH_RATE_LIMIT_MAX || 5);
const WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 5 * 60 * 1000);

interface Attempt {
  failures: number;
  blockedUntil: number | null; // epoch ms — null이면 미차단
}

/**
 * Next dev 핫리로드/모듈 재평가로 Map이 날아가지 않게 globalThis에 캐시.
 * (프로덕션 단일 인스턴스에서도 안전 — 최초 1회만 생성)
 */
const GLOBAL_KEY = Symbol.for('qa-scope.auth.rateLimit');
type GlobalStore = { store: Map<string, Attempt> };
const g = globalThis as unknown as Record<symbol, GlobalStore | undefined>;
const attempts: Map<string, Attempt> = (g[GLOBAL_KEY] ??= { store: new Map() }).store;

/** rate-limit 키 정규화 — DB username 조회가 대소문자 무시(utf8mb4_unicode_ci)라 동일 규칙 적용(casing 우회 차단). */
function keyOf(username: string): string {
  return username.trim().toLowerCase();
}

/**
 * 로그인 시도 전 호출 — 현재 차단 상태인지 확인.
 * 차단창이 이미 지났으면 자동 해제(엔트리 삭제)하고 통과시킨다.
 * @returns true = 차단 중(시도 거부해야 함)
 */
export function isRateLimited(username: string): boolean {
  const key = keyOf(username);
  const a = attempts.get(key);
  if (!a || a.blockedUntil === null) return false;

  if (Date.now() >= a.blockedUntil) {
    attempts.delete(key); // 자동 해제 — 다음 시도부터 새 창
    return false;
  }
  return true;
}

/** 로그인 실패 시 호출 — 실패 횟수 누적, MAX 도달 시 차단창 설정. */
export function recordFailure(username: string): void {
  const key = keyOf(username);
  const a = attempts.get(key) ?? { failures: 0, blockedUntil: null };

  // 이미 차단 중이면 그대로 유지(창 연장하지 않음 — 5분 뒤 자동 해제 보장).
  if (a.blockedUntil !== null && Date.now() < a.blockedUntil) {
    attempts.set(key, a);
    return;
  }

  a.failures += 1;
  if (a.failures >= MAX_FAILURES) {
    a.blockedUntil = Date.now() + WINDOW_MS;
  }
  attempts.set(key, a);
}

/** 로그인 성공 시 호출 — 해당 계정 카운터 초기화. */
export function recordSuccess(username: string): void {
  attempts.delete(keyOf(username));
}
