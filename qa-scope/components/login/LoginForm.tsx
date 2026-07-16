'use client';

/**
 * components/login/LoginForm.tsx — 최소 로그인 폼(민재 UI 담당 전까지 검증용).
 * useActionState로 서버 액션(loginAction) 결과의 에러 문구만 인라인 표시.
 * 색 하드코딩 없이 globals.css 디자인 토큰 클래스만 사용(설계문서 §5).
 */
import { useActionState } from 'react';
import { loginAction, type LoginState } from '@/app/login/actions';

const initialState: LoginState = { error: null };

const inputClass =
  'rounded-control border border-border bg-surface px-3 py-2 text-ink outline-none focus:border-primary';

export default function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-sub">아이디</span>
        <input name="username" type="text" autoComplete="username" required autoFocus className={inputClass} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-sub">비밀번호</span>
        <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </label>

      {state.error && (
        <p
          role="alert"
          className="rounded-control border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-text"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-control bg-primary px-3 py-2 text-sm font-medium text-ink-inverse transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {isPending ? '로그인 중…' : '로그인'}
      </button>
    </form>
  );
}
