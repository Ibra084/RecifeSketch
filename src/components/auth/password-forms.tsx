"use client"

import { useActionState, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Mail, UserRound } from "lucide-react"
import { cn } from "cn"
import {
  changeTemporaryPasswordAction,
  forgotPasswordAction,
  resendVerificationAction,
  resetPasswordAction,
} from "@/app/(auth)/actions"
import { initialFormState } from "@/lib/auth/form-state"
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/identity"
import { ErrorBanner, NoticeBanner, PasswordField, SubmitButton, TextField } from "./fields"

const PASSWORD_HINT = `At least ${PASSWORD_MIN_LENGTH} characters, with a letter and a number.`

// ─── Forgot password: personal email vs. administrator-assisted alias ──────

export function ForgotPasswordForm() {
  const params = useSearchParams()
  const [account, setAccount] = useState<"personal" | "alias">(
    params.get("account") === "alias" ? "alias" : "personal"
  )
  const [state, formAction] = useActionState(forgotPasswordAction, initialFormState)
  const [email, setEmail] = useState("")
  const linkExpired = params.get("error") === "link_invalid"

  const option = (value: "personal" | "alias", label: string, Icon: typeof Mail) => (
    <button
      type="button"
      role="radio"
      aria-checked={account === value}
      onClick={() => setAccount(value)}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-full py-2.5 text-[13px] font-semibold transition-all duration-200 active:scale-[0.98]",
        account === value
          ? "text-gray-900 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_4px_10px_-4px_rgba(15,23,42,0.12)]"
          : "text-gray-500 hover:bg-black/[0.03] hover:text-gray-700"
      )}
      style={account === value ? { background: "rgba(255,255,255,0.92)" } : undefined}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      {label}
    </button>
  )

  return (
    <div className="flex flex-col gap-3.5">
      <div
        role="radiogroup"
        aria-label="Which kind of account do you have?"
        className="flex items-center gap-1 rounded-full border border-black/[0.04] p-1"
        style={{ background: "rgba(15,23,42,0.04)" }}
      >
        {option("personal", "Personal email", Mail)}
        {option("alias", "Student alias", UserRound)}
      </div>

      {account === "personal" ? (
        state.message ? (
          <NoticeBanner>{state.message}</NoticeBanner>
        ) : (
          <form action={formAction} noValidate className="flex flex-col gap-3.5">
            {state.error ? (
              <ErrorBanner>{state.error}</ErrorBanner>
            ) : linkExpired ? (
              <ErrorBanner>That reset link has expired or was already used. Request a new one below.</ErrorBanner>
            ) : null}
            <TextField
              label="Personal email"
              name="email"
              type="email"
              icon="mail"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={state.fieldErrors?.email}
              autoFocus
              required
            />
            <SubmitButton pendingLabel="Sending link…">Send reset link</SubmitButton>
          </form>
        )
      ) : (
        <div className="rounded-2xl border border-black/[0.06] bg-white/60 px-4 py-4 text-[14px] leading-relaxed text-gray-600">
          <p className="font-semibold text-gray-900">Ask your teacher or administrator</p>
          <p className="mt-1">
            Student alias accounts don&apos;t have an email address, so we can&apos;t send a reset link. Your teacher
            or school administrator can give you a new temporary password. You&apos;ll choose your own password the
            next time you sign in.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Resend the verification email ──────────────────────────────────────────

export function ResendVerificationForm() {
  const [state, formAction] = useActionState(resendVerificationAction, initialFormState)
  const [email, setEmail] = useState("")
  if (state.message) return <NoticeBanner>{state.message}</NoticeBanner>

  return (
    <form action={formAction} noValidate className="flex flex-col gap-3">
      {state.error && <ErrorBanner>{state.error}</ErrorBanner>}
      <TextField
        label="Didn't get it? Resend to"
        name="email"
        type="email"
        icon="mail"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={state.fieldErrors?.email}
        required
      />
      <SubmitButton pendingLabel="Sending…">Resend verification email</SubmitButton>
    </form>
  )
}

// ─── Set a new password from the recovery link ─────────────────────────────

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(resetPasswordAction, initialFormState)
  const [password, setPassword] = useState("")
  return (
    <form action={formAction} noValidate className="flex flex-col gap-3.5">
      {state.error && <ErrorBanner>{state.error}</ErrorBanner>}
      <PasswordField
        label="New password"
        name="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={state.fieldErrors?.password}
        hint={PASSWORD_HINT}
        autoFocus
        required
      />
      <SubmitButton pendingLabel="Saving…">Save new password</SubmitButton>
    </form>
  )
}

// ─── Alias first sign-in: replace the temporary password ───────────────────

export function ChangeTemporaryPasswordForm() {
  const [state, formAction] = useActionState(changeTemporaryPasswordAction, initialFormState)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  return (
    <form action={formAction} noValidate className="flex flex-col gap-3.5">
      {state.error && <ErrorBanner>{state.error}</ErrorBanner>}
      <PasswordField
        label="New password"
        name="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={state.fieldErrors?.password}
        hint={PASSWORD_HINT}
        autoFocus
        required
      />
      <PasswordField
        label="Type it again"
        name="confirmPassword"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={state.fieldErrors?.confirmPassword}
        required
      />
      <SubmitButton pendingLabel="Saving…">Save password and continue</SubmitButton>
    </form>
  )
}
