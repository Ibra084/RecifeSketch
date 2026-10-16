import { Suspense } from "react"
import type { Metadata } from "next"
import { AppHeader } from "@/components/dashboard/app-header"
import { AliasManager } from "@/components/admin/alias-manager"
import { listAliasAccounts } from "@/lib/auth/alias-admin"
import { requireAuthConfig } from "@/lib/auth/config"
import { requireAdmin } from "@/lib/auth/session"
import { createAdminClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Admin · Recife Sketch" }

async function AdminContent() {
  await requireAdmin()
  const aliases = await listAliasAccounts(createAdminClient(), requireAuthConfig().aliasEmailDomain)
  return <AliasManager aliases={aliases} />
}

export default function AdminPage() {
  return (
    <div className="min-h-dvh bg-gray-50">
      <AppHeader active="admin" />
      <main className="animate-page-in mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">Student aliases</h1>
        <p className="mb-6 mt-0.5 text-sm text-gray-400">
          Create sign-ins for students without a personal email, and reset forgotten passwords.
        </p>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-white" />}>
          <AdminContent />
        </Suspense>
      </main>
    </div>
  )
}
