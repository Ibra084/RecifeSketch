import type { Metadata } from "next"
import { AuthCard, AuthHeading } from "@/components/auth/auth-card"
import { ResetPasswordForm } from "@/components/auth/password-forms"

export const metadata: Metadata = { title: "Choose a new password · Recife Sketch" }

/** Reached from the recovery email via /auth/confirm, which signs the student in first. */
export default function ResetPasswordPage() {
  return (
    <AuthCard>
      <AuthHeading title="Choose a new password" subtitle="You'll use this next time you sign in." />
      <ResetPasswordForm />
    </AuthCard>
  )
}
