"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { signUpAction } from "@/app/(auth)/actions"
import { initialFormState } from "@/lib/auth/form-state"
import { passwordProblem, PASSWORD_MIN_LENGTH } from "@/lib/auth/identity"
import { Checkbox, ErrorBanner, PasswordField, SubmitButton, TextField } from "./fields"

export function SignUpForm() {
  const [state, formAction] = useActionState(signUpAction, initialFormState)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [accepted, setAccepted] = useState(false)
  const [touched, setTouched] = useState(false)

  // Live hint once the student has typed something; the server re-checks.
  const livePasswordProblem = touched && password ? passwordProblem(password) : null

  return (
    <form action={formAction} noValidate className="flex flex-col gap-3.5">
      {state.error && <ErrorBanner>{state.error}</ErrorBanner>}

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
        hint="Not your school email. We'll send a link to verify it."
        autoFocus
        required
      />

      <PasswordField
        label="Create a password"
        name="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onBlur={() => setTouched(true)}
        error={state.fieldErrors?.password ?? livePasswordProblem ?? undefined}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters, with a letter and a number.`}
        required
      />

      <Checkbox name="acceptTerms" checked={accepted} onChange={setAccepted} error={state.fieldErrors?.acceptTerms}>
        I agree to the{" "}
        <Link href="/terms" target="_blank" className="text-gray-600 underline hover:text-gray-900">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" target="_blank" className="text-gray-600 underline hover:text-gray-900">
          Privacy Policy
        </Link>
        . If I&apos;m under 18, a parent or guardian knows I&apos;m using Recife Sketch.
      </Checkbox>

      <SubmitButton pendingLabel="Creating account…">Create account</SubmitButton>
    </form>
  )
}
