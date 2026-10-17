"use server"

import { redirect } from "next/navigation"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { readAuthConfig, requireAuthConfig } from "@/lib/auth/config"
import { loadBlockedEmailDomains } from "@/lib/auth/blocked-domains"
import { friendlyAuthError } from "@/lib/auth/errors"
import type { FormState } from "@/lib/auth/form-state"
import {
  isAliasEmail,
  isBlockedEmailDomain,
  parseIdentifier,
  passwordProblem,
  safeNextPath,
} from "@/lib/auth/identity"
import { getCurrentUser } from "@/lib/auth/session"

const NOT_CONFIGURED: FormState = {
  error: "Sign-in isn't set up on this server yet. Please ask your teacher or administrator.",
}

const SCHOOL_EMAIL_ERROR =
  "School email addresses can't be used. Please sign up with a personal email, or ask your teacher for a student alias."

function field(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === "string" ? value : ""
}

const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address."))

// ─── Sign in (personal email or student alias) ─────────────────────────────

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const config = readAuthConfig()
  const identifier = parseIdentifier(field(formData, "identifier"), config?.aliasEmailDomain)
  const password = field(formData, "password")
  const fieldErrors: FormState["fieldErrors"] = {}
  if (!identifier) fieldErrors.identifier = "Enter your personal email or your student alias."
  if (!password) fieldErrors.password = "Enter your password."
  if (!identifier || !password) return { fieldErrors }
  if (!config) return NOT_CONFIGURED

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email: identifier.email, password })
  if (error || !data.user) return { error: friendlyAuthError(error) }

  const meta = (data.user.app_metadata ?? {}) as Record<string, unknown>
  if (meta.account_type === "alias" && meta.must_change_password === true) redirect("/change-password")
  redirect(safeNextPath(field(formData, "next")))
}

// ─── Create account (personal email only) ───────────────────────────────────

const signUpSchema = z.object({
  email: emailSchema,
  password: z.string(),
  acceptTerms: z.literal("on", { error: "Please agree to continue." }),
})

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const config = readAuthConfig()
  const parsed = signUpSchema.safeParse({
    email: field(formData, "email"),
    password: field(formData, "password"),
    acceptTerms: formData.get("acceptTerms") ?? undefined,
  })
  const fieldErrors: FormState["fieldErrors"] = {}
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0])
      fieldErrors[key] ??= issue.message
    }
  }
  const pwProblem = passwordProblem(field(formData, "password"))
  if (pwProblem) fieldErrors.password = pwProblem
  if (!parsed.success || pwProblem) return { fieldErrors }
  if (!config) return NOT_CONFIGURED

  const { email, password } = parsed.data
  if (isAliasEmail(email, config.aliasEmailDomain)) {
    return { fieldErrors: { email: "Enter a personal email address." } }
  }

  let blocked: string[]
  try {
    blocked = await loadBlockedEmailDomains()
  } catch (err) {
    console.error("[auth] sign-up blocked-domain check failed", err)
    return { error: "We couldn't create your account right now. Please try again later." }
  }
  if (isBlockedEmailDomain(email, blocked)) return { fieldErrors: { email: SCHOOL_EMAIL_ERROR } }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${config.siteUrl}/auth/confirm?next=/dashboard`,
      // Only the acknowledgement timestamp: no names or other personal data.
      data: { terms_accepted_at: new Date().toISOString() },
    },
  })
  if (error) return { error: friendlyAuthError(error) }

  // Supabase deliberately returns success for an already-registered email
  // (no account enumeration), so every success path lands on the same page.
  redirect("/check-email")
}

export async function resendVerificationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const config = readAuthConfig()
  if (!config) return NOT_CONFIGURED
  const parsed = emailSchema.safeParse(field(formData, "email"))
  if (!parsed.success) return { fieldErrors: { email: "Enter a valid email address." } }

  const supabase = await createClient()
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data,
    options: { emailRedirectTo: `${config.siteUrl}/auth/confirm?next=/dashboard` },
  })
  if (error && error.status === 429) return { error: friendlyAuthError(error) }
  return { message: "If that address has an account waiting to be verified, we've sent a new link." }
}

// ─── Password recovery ─────────────────────────────────────────────────────

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const config = readAuthConfig()
  const raw = field(formData, "email").trim()
  if (raw && !raw.includes("@")) {
    return {
      fieldErrors: {
        email: "That looks like a student alias. Alias passwords are reset by your teacher or administrator.",
      },
    }
  }
  const parsed = emailSchema.safeParse(raw)
  if (!parsed.success) return { fieldErrors: { email: "Enter the personal email you signed up with." } }
  if (!config) return NOT_CONFIGURED
  if (isAliasEmail(parsed.data, config.aliasEmailDomain)) {
    return { fieldErrors: { email: "Alias passwords are reset by your teacher or administrator." } }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${config.siteUrl}/auth/confirm?next=/reset-password`,
  })
  if (error && error.status === 429) return { error: friendlyAuthError(error) }
  if (error) console.error("[auth] resetPasswordForEmail failed", error.code, error.status)

  // Same response whether or not the account exists.
  return {
    message: "If an account uses that email, a reset link is on its way. It expires in one hour.",
  }
}

/** Sets a new password from the email recovery link's session. */
export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  requireAuthConfig()
  const user = await getCurrentUser()
  if (!user) return { error: "Your reset link has expired. Please request a new one." }

  const password = field(formData, "password")
  const problem = passwordProblem(password)
  if (problem) return { fieldErrors: { password: problem } }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: friendlyAuthError(error) }
  redirect("/dashboard?notice=password-updated")
}

// ─── Alias first sign-in: replace the temporary password ───────────────────

export async function changeTemporaryPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  requireAuthConfig()
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")
  if (!user.mustChangePassword) redirect("/dashboard")

  const password = field(formData, "password")
  const confirm = field(formData, "confirmPassword")
  const problem = passwordProblem(password)
  if (problem) return { fieldErrors: { password: problem } }
  if (password !== confirm) return { fieldErrors: { confirmPassword: "The passwords don't match." } }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: friendlyAuthError(error) }

  // The flag lives in app_metadata, which only the service role can write.
  const admin = createAdminClient()
  const { data: existing, error: readError } = await admin.auth.admin.getUserById(user.id)
  if (readError || !existing.user) return { error: friendlyAuthError(readError) }
  const { error: flagError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...existing.user.app_metadata, must_change_password: false },
  })
  if (flagError) return { error: friendlyAuthError(flagError) }

  // Re-issue the JWT so the proxy sees the cleared flag immediately.
  await supabase.auth.refreshSession()
  redirect("/dashboard?notice=welcome")
}

// ─── Sign out ──────────────────────────────────────────────────────────────

export async function signOutAction(): Promise<void> {
  if (readAuthConfig()) {
    const supabase = await createClient()
    await supabase.auth.signOut({ scope: "local" })
  }
  redirect("/sign-in")
}
