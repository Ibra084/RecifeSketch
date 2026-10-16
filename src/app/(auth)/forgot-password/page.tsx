import { Suspense } from "react"
import type { Metadata } from "next"
import { AuthCard, AuthFootnote, AuthHeading, TextLink } from "@/components/auth/auth-card"
import { FormSkeleton } from "@/components/auth/form-skeleton"
import { ForgotPasswordForm } from "@/components/auth/password-forms"

export const metadata: Metadata = { title: "Reset password · Recife Sketch" }

export default function ForgotPasswordPage() {
  return (
    <AuthCard>
      <AuthHeading title="Forgot your password?" subtitle="No problem. Let's get you back to your whiteboards." />
      <Suspense fallback={<FormSkeleton fields={1} />}>
        <ForgotPasswordForm />
      </Suspense>
      <AuthFootnote>
        Remembered it? <TextLink href="/sign-in">Back to sign in</TextLink>
      </AuthFootnote>
    </AuthCard>
  )
}
