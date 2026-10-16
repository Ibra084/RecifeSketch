import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { UserRound } from "lucide-react"
import { AuthCard, AuthDivider, AuthFootnote, AuthHeading, AuthTabs, TextLink } from "@/components/auth/auth-card"
import { FormSkeleton } from "@/components/auth/form-skeleton"
import { SignInForm } from "@/components/auth/sign-in-form"

export const metadata: Metadata = { title: "Sign in · Recife Sketch" }

export default function SignInPage() {
  return (
    <AuthCard>
      <AuthTabs active="sign-in" />
      <AuthHeading title="Welcome back" subtitle="Your whiteboards are right where you left them." />
      <Suspense fallback={<FormSkeleton />}>
        <SignInForm />
      </Suspense>

      <AuthDivider>No personal email?</AuthDivider>

      <Link
        href="/alias"
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-white/50 text-sm font-medium text-gray-600 backdrop-blur-sm transition-all duration-150 hover:-translate-y-px hover:bg-white/80 active:scale-[0.98]"
      >
        <UserRound className="h-4 w-4 text-gray-400" strokeWidth={1.75} aria-hidden />
        Sign in with a student alias
      </Link>

      <AuthFootnote>
        New to Recife Sketch? <TextLink href="/sign-up">Create an account</TextLink>
      </AuthFootnote>
    </AuthCard>
  )
}
