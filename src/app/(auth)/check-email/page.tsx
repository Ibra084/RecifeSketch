import type { Metadata } from "next"
import { MailCheck } from "lucide-react"
import { AuthCard, AuthDivider, AuthFootnote, TextLink } from "@/components/auth/auth-card"
import { ResendVerificationForm } from "@/components/auth/password-forms"

export const metadata: Metadata = { title: "Check your email · Recife Sketch" }

export default function CheckEmailPage() {
  return (
    <AuthCard>
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
        <MailCheck className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </div>
      <h1 id="auth-panel-title" className="mb-1 text-2xl font-bold tracking-tight text-gray-900">
        Check your email
      </h1>
      <p className="text-[15px] leading-relaxed text-gray-500">
        We&apos;ve sent a verification link to the address you used. Open it on this device to finish creating your
        account. It can take a minute or two, so check your spam folder too.
      </p>

      <AuthDivider>Still waiting?</AuthDivider>
      <ResendVerificationForm />

      <AuthFootnote>
        Already verified? <TextLink href="/sign-in">Sign in</TextLink>
      </AuthFootnote>
    </AuthCard>
  )
}
