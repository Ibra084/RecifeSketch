/**
 * Pure identity rules shared by the auth server actions, the admin alias
 * script and tests. No Supabase or Next imports here, so it stays trivially
 * testable and can run in any runtime.
 *
 * Two kinds of account exist:
 * - "personal": a student's own (non-school) email address, verified by email.
 * - "alias": an administrator-issued handle (e.g. `maths7b-amira`) for students
 *   without a personal email. Supabase Auth requires an email per user, so an
 *   alias is stored under a reserved, undeliverable domain (RFC 2606 `.invalid`)
 *   and never receives mail.
 */

export const DEFAULT_ALIAS_EMAIL_DOMAIN = "alias.recife-sketch.invalid"

export const ALIAS_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,30})[a-z0-9]$/

export const PASSWORD_MIN_LENGTH = 8
/** bcrypt (used by Supabase Auth) ignores bytes past 72. */
export const PASSWORD_MAX_LENGTH = 72

export type AccountType = "personal" | "alias"

export type Identifier =
  | { kind: "email"; email: string }
  | { kind: "alias"; alias: string; email: string }

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function normalizeAlias(alias: string): string {
  return alias.trim().toLowerCase()
}

export function isValidAlias(alias: string): boolean {
  return ALIAS_PATTERN.test(alias) && !/[._-]{2}/.test(alias)
}

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@")
  if (at < 1 || at === email.length - 1) return null
  return email.slice(at + 1).toLowerCase()
}

export function aliasToEmail(alias: string, aliasDomain = DEFAULT_ALIAS_EMAIL_DOMAIN): string {
  return `${normalizeAlias(alias)}@${aliasDomain}`
}

export function isAliasEmail(email: string, aliasDomain = DEFAULT_ALIAS_EMAIL_DOMAIN): boolean {
  return emailDomain(normalizeEmail(email)) === aliasDomain
}

export function aliasFromEmail(email: string, aliasDomain = DEFAULT_ALIAS_EMAIL_DOMAIN): string | null {
  const normalized = normalizeEmail(email)
  if (!isAliasEmail(normalized, aliasDomain)) return null
  return normalized.slice(0, normalized.lastIndexOf("@"))
}

/**
 * True when `email`'s domain is a blocked domain or a subdomain of one, so
 * blocking `jess.sch.ae` also blocks `students.jess.sch.ae`. Mirrored in SQL
 * by `public.is_blocked_email_domain` for the Supabase before-user-created hook.
 */
export function isBlockedEmailDomain(email: string, blockedDomains: readonly string[]): boolean {
  const domain = emailDomain(normalizeEmail(email))
  if (!domain) return false
  return blockedDomains.some((raw) => {
    const blocked = raw.trim().toLowerCase().replace(/^@/, "")
    return blocked.length > 0 && (domain === blocked || domain.endsWith(`.${blocked}`))
  })
}

/**
 * Interprets the single "email or student alias" sign-in field. Anything with
 * an `@` is an email; anything else must be a well-formed alias.
 */
export function parseIdentifier(
  raw: string,
  aliasDomain = DEFAULT_ALIAS_EMAIL_DOMAIN
): Identifier | null {
  const value = raw.trim()
  if (!value) return null
  if (value.includes("@")) {
    const email = normalizeEmail(value)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
    const alias = aliasFromEmail(email, aliasDomain)
    if (alias) return { kind: "alias", alias, email }
    return { kind: "email", email }
  }
  const alias = normalizeAlias(value)
  if (!isValidAlias(alias)) return null
  return { kind: "alias", alias, email: aliasToEmail(alias, aliasDomain) }
}

/** Returns a student-friendly problem with a new password, or null if acceptable. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Use at most ${PASSWORD_MAX_LENGTH} characters.`
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Include at least one letter and one number."
  }
  return null
}

/**
 * Only same-origin, absolute-path redirects are honoured so a crafted
 * `?next=` can't bounce a student to another site after sign-in.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback
  }
  return next
}
