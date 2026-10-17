import { Suspense } from "react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { ShieldCheck } from "lucide-react"
import { AuthCard } from "@/components/auth/auth-card"
import { FormSkeleton } from "@/components/auth/form-skeleton"
import { ChangeTemporaryPasswordForm } from "@/components/auth/password-forms"
import { requireUser } from "@/lib/auth/session"
import { signOutAction } from "../actions"

export const metadata: Metadata = { title: "Choose your password · Recife Sketch" }

async function Greeting() {
  const user = await requireUser({ allowPendingPasswordChange: true })
  if (!user.mustChangePassword) redirect("/dashboard")
  return (
    <p className="text-[15px] leading-relaxed text-gray-500">
      Signed in as <span className="font-semibold text-gray-800">{user.alias}</span>. Replace the temporary password
      from your teacher with one only you know.
    </p>
  )
}

export default function ChangeTemporaryPasswordPage() {
  return (
    <AuthCard>
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
        <ShieldCheck className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </div>
      <h1 id="auth-panel-title" className="mb-1 text-2xl font-bold tracking-tight text-gray-900">
        Choose your own password
      </h1>
      <Suspense fallback={<div className="h-12 animate-pulse rounded-lg bg-gray-100" />}>
        <Greeting />
      </Suspense>
      <div className="mt-5">
        <Suspense fallback={<FormSkeleton />}>
          <ChangeTemporaryPasswordForm />
        </Suspense>
      </div>
      <form action={signOutAction} className="mt-4 text-center">
        <button type="submit" className="text-sm text-gray-400 transition-colors duration-150 hover:text-gray-700">
          Not you? Sign out
        </button>
      </form>
    </AuthCard>
  )
}
