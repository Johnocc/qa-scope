'use server';

/**
 * app/login/actions.ts — 로그인 서버 액션
 *
 * 정본 계약: docs/db/로그인 설계문서 v1 20260716.md §5 + 백엔드 구현노트 §5.
 *  - 실패 문구는 단일 통일("아이디 또는 비밀번호가 올바르지 않습니다") —
 *    어느 쪽이 틀렸는지 노출 금지(계정 존재 여부 은닉).
 *  - 시도 제한 발동(authorize가 던지는 code='RateLimited')만 별도 문구로 분기.
 *  - 성공 시 signIn이 callbackUrl로 redirect(NEXT_REDIRECT throw) → 그대로 전파.
 */
import { AuthError } from 'next-auth';
import { signIn } from '@/auth';

export interface LoginState {
  error: string | null;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get('username') ?? '');
  const password = String(formData.get('password') ?? '');
  // callbackUrl 새니타이즈 — 오픈 리다이렉트 방지(상대경로만 허용).
  const rawCallback = String(formData.get('callbackUrl') ?? '/');
  const callbackUrl =
    rawCallback.startsWith('/') && !rawCallback.startsWith('//') ? rawCallback : '/';

  try {
    await signIn('credentials', { username, password, redirectTo: callbackUrl });
  } catch (error) {
    if (error instanceof AuthError) {
      const code = (error as { code?: string }).code;
      if (code === 'RateLimited') return { error: '잠시 후 다시 시도해 주세요' };
      return { error: '아이디 또는 비밀번호가 올바르지 않습니다' };
    }
    throw error; // 성공 시 redirect(NEXT_REDIRECT) 등 비-AuthError는 그대로 전파
  }
  return { error: null };
}
