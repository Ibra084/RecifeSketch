"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { signInAction } from "@/app/(auth)/actions"
import { initialFormState } from "@/lib/auth/form-state"
import { ErrorBanner, NoticeBanner, PasswordField, SubmitButton, TextField } from "./fields"

const LINK_ERRORS: Record<string, string> = {
  link_invalid: "That link has expired or was already used. Please sign in, or request a new link.",
  not_configured: "Sign-in isn't set up on this server yet.",
}

const NOTICES: Record<string, string> = {
  "account-deleted": "Your account and whiteboards have been deleted.",
  "signed-out": "You've signed out.",
}

export function SignInForm({ variant = "default" }: { variant?: "default" | "alias" }) {
  const [state, formAction] = useActionState(signInAction, initialFormState)
  const params = useSearchParams()
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")

  const linkError = LINK_ERRORS[params.get("error") ?? ""]
  const notice = NOTICES[params.get("notice") ?? ""]
  const isAlias = variant === "alias"

  return (
    <form action={formAction} noValidate className="flex flex-col gap-3.5">
      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : linkError ? <ErrorBanner>{linkError}</ErrorBanner> : null}
      {notice && !state.error && <NoticeBanner>{notice}</NoticeBanner>}

      <input type="hidden" name="next" value={params.get("next") ?? ""} />

      <TextField
        label={isAlias ? "Student alias" : "Personal email or student alias"}
        name="identifier"
        icon={isAlias ? "user" : "mail"}
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        inputMode={isAlias ? "text" : "email"}
        placeholder={isAlias ? "e.g. maths7b-amira" : "you@example.com or your alias"}
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        error={state.fieldErrors?.identifier}
        hint={isAlias ? "The alias your teacher or administrator gave you." : undefined}
        autoFocus
        required
      />

      <PasswordField
        label={isAlias ? "Password (temporary on first sign-in)" : "Password"}
        name="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={state.fieldErrors?.password}
        labelAside={
          <Link
            href={isAlias ? "/forgot-password?account=alias" : "/forgot-password"}
            className="text-xs text-gray-400 transition-colors duration-150 hover:text-blue-600"
          >
            Forgot password?
          </Link>
        }
        required
      />

      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
    </form>
  )
}
