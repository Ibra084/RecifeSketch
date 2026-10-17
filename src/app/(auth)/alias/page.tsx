import { Suspense } from "react"
import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { AuthCard, AuthFootnote, AuthHeading } from "@/components/auth/auth-card"
import { FormSkeleton } from "@/components/auth/form-skeleton"
import { SignInForm } from "@/components/auth/sign-in-form"

export const metadata: Metadata = { title: "Student alias sign-in · Recife Sketch" }

export default function AliasSignInPage() {
  return (
    <AuthCard>
      <Link
        href="/sign-in"
        className="-ml-1 mb-4 inline-flex items-center gap-1.5 rounded-full px-1 py-1 text-[13px] font-medium text-gray-400 transition-colors duration-150 hover:text-gray-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        Back
      </Link>
      <AuthHeading
        title="Student alias"
        subtitle="For students without a personal email. Your teacher or administrator gives you an alias and a temporary password."
      />
      <Suspense fallback={<FormSkeleton />}>
        <SignInForm variant="alias" />
      </Suspense>
      <div className="mt-4 rounded-xl bg-blue-50/70 px-4 py-3 text-[13px] leading-relaxed text-blue-900/80">
        First time signing in? You&apos;ll be asked to choose your own password straight away. No email is needed.
      </div>
      <AuthFootnote>
        Have a personal email? <Link href="/sign-in" className="font-medium text-blue-600 hover:underline">Sign in normally</Link>
      </AuthFootnote>
    </AuthCard>
  )
}
