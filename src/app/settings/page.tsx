import { Suspense, type ReactNode } from "react"
import type { Metadata } from "next"
import { AppHeader } from "@/components/dashboard/app-header"
import { ChangePasswordForm, DeleteAccountForm } from "@/components/dashboard/settings-forms"
import { requireUser } from "@/lib/auth/session"

export const metadata: Metadata = { title: "Settings · Recife Sketch" }

function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 sm:p-6">
      <h2 className="text-[16px] font-semibold text-gray-900">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-gray-400">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

async function SettingsContent() {
  const user = await requireUser()
  const isAlias = user.accountType === "alias"

  return (
    <div className="flex flex-col gap-4">
      <Section title="Account">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-gray-400">Type</dt>
          <dd className="text-gray-800">{isAlias ? "Student alias (managed by your school)" : "Personal email"}</dd>
          <dt className="text-gray-400">{isAlias ? "Alias" : "Email"}</dt>
          <dd className="break-all font-medium text-gray-900">{isAlias ? user.alias : user.email}</dd>
        </dl>
      </Section>

      <Section title="Password" description="Choose something only you know.">
        <ChangePasswordForm />
      </Section>

      <Section
        title="Delete account"
        description={
          isAlias
            ? "Your school manages student alias accounts. Ask your teacher if you'd like it removed."
            : "Permanently deletes your account and every whiteboard you've saved. This can't be undone."
        }
      >
        {isAlias ? null : <DeleteAccountForm />}
      </Section>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <div className="min-h-dvh bg-gray-50">
      <AppHeader active="settings" />
      <main className="animate-page-in mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="mb-6 text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">Settings</h1>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-white" />}>
          <SettingsContent />
        </Suspense>
      </main>
    </div>
  )
}
