"use server"

import { redirect } from "next/navigation"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { friendlyAuthError } from "@/lib/auth/errors"
import type { FormState } from "@/lib/auth/form-state"
import { passwordProblem } from "@/lib/auth/identity"
import { getCurrentUser } from "@/lib/auth/session"
import { readAuthConfig } from "@/lib/auth/config"
import { aliasToEmail } from "@/lib/auth/identity"

function field(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === "string" ? value : ""
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const config = readAuthConfig()
  const user = await getCurrentUser()
  if (!config || !user) redirect("/sign-in")

  const current = field(formData, "currentPassword")
  const next = field(formData, "newPassword")
  if (!current) return { fieldErrors: { currentPassword: "Enter your current password." } }
  const problem = passwordProblem(next)
  if (problem) return { fieldErrors: { newPassword: problem } }
  if (next === current) return { fieldErrors: { newPassword: "Choose a password you haven't used here." } }

  const supabase = await createClient()
  // Re-check the current password so an unattended, signed-in device can't
  // be used to take over the account.
  const email = user.accountType === "alias" ? aliasToEmail(user.alias!, config.aliasEmailDomain) : user.email!
  const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: current })
  if (verifyError) return { fieldErrors: { currentPassword: "That isn't your current password." } }

  const { error } = await supabase.auth.updateUser({ password: next })
  if (error) return { error: friendlyAuthError(error) }
  return { message: "Password updated." }
}

/**
 * Permanently deletes a personal account and (via ON DELETE CASCADE) all of
 * its whiteboards. Alias accounts belong to the school, which manages them.
 */
export async function deleteAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")
  if (user.accountType === "alias") {
    return { error: "Student alias accounts are managed by your school. Ask your teacher to remove it." }
  }
  if (field(formData, "confirm").trim().toLowerCase() !== "delete") {
    return { fieldErrors: { confirm: 'Type "delete" to confirm.' } }
  }

  const { error } = await createAdminClient().auth.admin.deleteUser(user.id)
  if (error) return { error: friendlyAuthError(error) }

  const supabase = await createClient()
  await supabase.auth.signOut({ scope: "local" })
  redirect("/sign-in?notice=account-deleted")
}
