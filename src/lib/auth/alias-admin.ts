/**
 * Student alias account management, shared by the /admin page (server
 * actions) and scripts/student-alias.mts. Every function needs a
 * service-role Supabase client, so this must only ever run on the server.
 *
 * Deliberately free of `server-only` and `@/` imports so Node can run the
 * script against it directly.
 */
import { randomInt } from "node:crypto"
import type { SupabaseClient, User } from "@supabase/supabase-js"
import { aliasFromEmail, aliasToEmail, isValidAlias, normalizeAlias } from "./identity.ts"

export interface AliasAccount {
  alias: string
  userId: string
  createdAt: string
  lastSignInAt: string | null
  /** Still on the temporary password an administrator issued. */
  pendingPasswordChange: boolean
}

export class AliasAdminError extends Error {}

/** Easy to read aloud or copy from a slip of paper: no 0/O/1/l/I. */
export function temporaryPassword(): string {
  const letters = "abcdefghjkmnpqrstuvwxyz"
  const digits = "23456789"
  const pick = (set: string, n: number) => Array.from({ length: n }, () => set[randomInt(set.length)]).join("")
  return `${pick(letters, 4)}-${pick(digits, 4)}-${pick(letters, 4)}`
}

export function parseAlias(raw: string): string {
  const alias = normalizeAlias(raw)
  if (!isValidAlias(alias)) {
    throw new AliasAdminError(
      "Aliases are 3–32 characters: lowercase letters, numbers, and single . _ - between them."
    )
  }
  return alias
}

async function allUsers(admin: SupabaseClient): Promise<User[]> {
  const users: User[] = []
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new AliasAdminError(error.message)
    users.push(...data.users)
    if (data.users.length < 1000) return users
  }
}

/** Only accounts that are both on the alias domain and flagged as aliases by an admin. */
function isAliasUser(user: User, aliasDomain: string): boolean {
  return Boolean(user.email && aliasFromEmail(user.email, aliasDomain) && user.app_metadata?.account_type === "alias")
}

async function findAliasUser(admin: SupabaseClient, alias: string, aliasDomain: string): Promise<User | null> {
  const email = aliasToEmail(alias, aliasDomain)
  return (await allUsers(admin)).find((u) => u.email === email && isAliasUser(u, aliasDomain)) ?? null
}

export async function listAliasAccounts(admin: SupabaseClient, aliasDomain: string): Promise<AliasAccount[]> {
  return (await allUsers(admin))
    .filter((u) => isAliasUser(u, aliasDomain))
    .map((u) => ({
      alias: aliasFromEmail(u.email!, aliasDomain)!,
      userId: u.id,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      pendingPasswordChange: u.app_metadata?.must_change_password === true,
    }))
    .sort((a, b) => a.alias.localeCompare(b.alias))
}

/** Creates an alias account and returns its one-time temporary password. */
export async function createAliasAccount(admin: SupabaseClient, rawAlias: string, aliasDomain: string) {
  const alias = parseAlias(rawAlias)
  const email = aliasToEmail(alias, aliasDomain)
  if ((await allUsers(admin)).some((u) => u.email === email)) {
    throw new AliasAdminError(`"${alias}" is already taken. Choose another alias, or reset its password.`)
  }
  const password = temporaryPassword()
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // no inbox exists; aliases skip email verification
    app_metadata: { account_type: "alias", must_change_password: true },
  })
  if (error) throw new AliasAdminError(error.message)
  return { alias, password }
}

/** Issues a new temporary password and signs the student out everywhere. */
export async function resetAliasPassword(admin: SupabaseClient, rawAlias: string, aliasDomain: string) {
  const alias = parseAlias(rawAlias)
  const user = await findAliasUser(admin, alias, aliasDomain)
  if (!user) throw new AliasAdminError(`No student alias "${alias}".`)
  const password = temporaryPassword()
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password,
    app_metadata: { ...user.app_metadata, account_type: "alias", must_change_password: true },
  })
  if (error) throw new AliasAdminError(error.message)
  await admin.auth.admin.signOut(user.id, "global").catch(() => undefined)
  return { alias, password }
}

/** Deletes the alias account; its whiteboards go with it (ON DELETE CASCADE), and its stored images are removed. */
export async function deleteAliasAccount(admin: SupabaseClient, rawAlias: string, aliasDomain: string) {
  const alias = parseAlias(rawAlias)
  const user = await findAliasUser(admin, alias, aliasDomain)
  if (!user) throw new AliasAdminError(`No student alias "${alias}".`)
  await removeStoredImages(admin, user.id).catch(() => undefined)
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) throw new AliasAdminError(error.message)
  return { alias }
}

/** The student's whiteboard images (bucket and layout as in src/lib/whiteboards/images.ts). */
async function removeStoredImages(admin: SupabaseClient, userId: string): Promise<void> {
  const bucket = admin.storage.from("board-images")
  const { data: boards } = await bucket.list(userId, { limit: 1000 })
  for (const board of boards ?? []) {
    const folder = `${userId}/${board.name}`
    const { data: files } = await bucket.list(folder, { limit: 1000 })
    const paths = (files ?? []).map((file) => `${folder}/${file.name}`)
    if (paths.length > 0) await bucket.remove(paths)
  }
}

/** Grants or removes the admin role on a personal (email) account. */
export async function setAdminRole(admin: SupabaseClient, rawEmail: string, aliasDomain: string, isAdmin: boolean) {
  const email = rawEmail.trim().toLowerCase()
  const user = (await allUsers(admin)).find((u) => u.email === email)
  if (!user) throw new AliasAdminError(`No account with the email ${email}. Sign up with it first.`)
  if (aliasFromEmail(email, aliasDomain)) throw new AliasAdminError("Student alias accounts can't be admins.")
  // Supabase merges app_metadata on update, so removal means setting it to null.
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, role: isAdmin ? "admin" : null },
  })
  if (error) throw new AliasAdminError(error.message)
  return { email }
}
