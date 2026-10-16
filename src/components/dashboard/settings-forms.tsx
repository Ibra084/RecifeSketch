"use client"

import { useActionState, useState } from "react"
import { changePasswordAction, deleteAccountAction } from "@/app/settings/actions"
import { initialFormState } from "@/lib/auth/form-state"
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/identity"
import { ErrorBanner, NoticeBanner, PasswordField, TextField } from "@/components/auth/fields"
import { useFormStatus } from "react-dom"

function SmallSubmit({ children, pendingLabel, tone = "primary" }: { children: string; pendingLabel: string; tone?: "primary" | "danger" }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className={
        tone === "danger"
          ? "rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-red-700 active:scale-[0.98] disabled:opacity-60"
          : "rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:-translate-y-px hover:bg-blue-700 active:scale-[0.98] disabled:opacity-60 disabled:hover:translate-y-0"
      }
    >
      {pending ? pendingLabel : children}
    </button>
  )
}

export function ChangePasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, initialFormState)
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")

  return (
    <form action={formAction} noValidate className="flex max-w-sm flex-col gap-3.5">
      {state.error && <ErrorBanner>{state.error}</ErrorBanner>}
      {state.message && <NoticeBanner>{state.message}</NoticeBanner>}
      <PasswordField
        label="Current password"
        name="currentPassword"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        error={state.fieldErrors?.currentPassword}
      />
      <PasswordField
        label="New password"
        name="newPassword"
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        error={state.fieldErrors?.newPassword}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters, with a letter and a number.`}
      />
      <div>
        <SmallSubmit pendingLabel="Updating…">Update password</SmallSubmit>
      </div>
    </form>
  )
}

export function DeleteAccountForm() {
  const [state, formAction] = useActionState(deleteAccountAction, initialFormState)
  const [confirm, setConfirm] = useState("")
  return (
    <form action={formAction} noValidate className="flex max-w-sm flex-col gap-3.5">
      {state.error && <ErrorBanner>{state.error}</ErrorBanner>}
      <TextField
        label='Type "delete" to confirm'
        name="confirm"
        autoComplete="off"
        autoCapitalize="none"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={state.fieldErrors?.confirm}
      />
      <div>
        <SmallSubmit tone="danger" pendingLabel="Deleting…">
          Delete my account
        </SmallSubmit>
      </div>
    </form>
  )
}
