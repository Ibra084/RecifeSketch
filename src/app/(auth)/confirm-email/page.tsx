import { Suspense } from "react"
import type { Metadata } from "next"
import { MailCheck } from "lucide-react"
import { AuthCard } from "@/components/auth/auth-card"
import { ConfirmLinkForm } from "@/components/auth/confirm-link-form"
import { FormSkeleton } from "@/components/auth/form-skeleton"

export const metadata: Metadata = { title: "Confirm your email · Recife Sketch" }

/** Reached from an email link via /auth/confirm; nothing is used up until the button is pressed. */
export default function ConfirmEmailPage() {
  return (
    <AuthCard>
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
        <MailCheck className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </div>
      <h1 id="auth-panel-title" className="mb-1 text-2xl font-bold tracking-tight text-gray-900">
        One more step
      </h1>
      <p className="mb-5 text-[15px] leading-relaxed text-gray-500">Press the button to carry on.</p>
      <Suspense fallback={<FormSkeleton />}>
        <ConfirmLinkForm />
      </Suspense>
    </AuthCard>
  )
}
