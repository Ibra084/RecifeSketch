import { describe, expect, it, vi } from "vitest"
import type { SupabaseClient, User } from "@supabase/supabase-js"
import {
  AliasAdminError,
  createAliasAccount,
  deleteAliasAccount,
  listAliasAccounts,
  resetAliasPassword,
  setAdminRole,
  temporaryPassword,
} from "./alias-admin"

const DOMAIN = "alias.recife-sketch.invalid"

function fakeAdmin(users: Partial<User>[]) {
  const api = {
    listUsers: vi.fn(async () => ({ data: { users: users as User[] }, error: null })),
    createUser: vi.fn(async () => ({ data: {}, error: null })),
    updateUserById: vi.fn(async () => ({ data: {}, error: null })),
    deleteUser: vi.fn(async () => ({ data: {}, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  }
  return { client: { auth: { admin: api } } as unknown as SupabaseClient, api }
}

const aliasUser = (alias: string, extra: Record<string, unknown> = {}): Partial<User> => ({
  id: `id-${alias}`,
  email: `${alias}@${DOMAIN}`,
  created_at: "2026-10-17T00:00:00Z",
  app_metadata: { account_type: "alias", must_change_password: true, ...extra },
})
const personal: Partial<User> = { id: "id-me", email: "me@gmail.com", created_at: "2026-10-17T00:00:00Z", app_metadata: {} }

describe("temporaryPassword", () => {
  it("is readable and meets the password policy", () => {
    expect(temporaryPassword()).toMatch(/^[a-hjkmnp-z]{4}-[2-9]{4}-[a-hjkmnp-z]{4}$/)
  })
})

describe("createAliasAccount", () => {
  it("creates a pre-verified alias that must change its password", async () => {
    const { client, api } = fakeAdmin([])
    const { alias, password } = await createAliasAccount(client, " Maths7B-01 ", DOMAIN)
    expect(alias).toBe("maths7b-01")
    expect(api.createUser).toHaveBeenCalledWith({
      email: `maths7b-01@${DOMAIN}`,
      password,
      email_confirm: true,
      app_metadata: { account_type: "alias", must_change_password: true },
    })
  })

  it("rejects taken and malformed aliases", async () => {
    const { client } = fakeAdmin([aliasUser("maths7b-01")])
    await expect(createAliasAccount(client, "maths7b-01", DOMAIN)).rejects.toBeInstanceOf(AliasAdminError)
    await expect(createAliasAccount(client, "no spaces", DOMAIN)).rejects.toBeInstanceOf(AliasAdminError)
  })
})

describe("reset and delete", () => {
  it("resets an alias, forces a password change and signs it out", async () => {
    const { client, api } = fakeAdmin([aliasUser("amira01", { must_change_password: false })])
    const { password } = await resetAliasPassword(client, "amira01", DOMAIN)
    expect(api.updateUserById).toHaveBeenCalledWith("id-amira01", {
      password,
      app_metadata: { account_type: "alias", must_change_password: true },
    })
    expect(api.signOut).toHaveBeenCalledWith("id-amira01", "global")
  })

  it("never touches accounts that aren't flagged aliases", async () => {
    // Same reserved domain but no alias flag, e.g. created some other way.
    const unflagged = { ...aliasUser("ghost01"), app_metadata: {} }
    const { client, api } = fakeAdmin([personal, unflagged])
    await expect(deleteAliasAccount(client, "ghost01", DOMAIN)).rejects.toThrow(/No student alias/)
    await expect(resetAliasPassword(client, "ghost01", DOMAIN)).rejects.toThrow(/No student alias/)
    expect(api.deleteUser).not.toHaveBeenCalled()
    expect(api.updateUserById).not.toHaveBeenCalled()
  })
})

describe("listAliasAccounts", () => {
  it("lists only alias accounts, sorted, with their status", async () => {
    const { client } = fakeAdmin([aliasUser("zed01"), personal, aliasUser("amy01", { must_change_password: false })])
    const list = await listAliasAccounts(client, DOMAIN)
    expect(list.map((a) => [a.alias, a.pendingPasswordChange])).toEqual([
      ["amy01", false],
      ["zed01", true],
    ])
  })
})

describe("setAdminRole", () => {
  it("grants and removes the role on a personal account", async () => {
    const { client, api } = fakeAdmin([personal])
    await setAdminRole(client, " Me@Gmail.com ", DOMAIN, true)
    expect(api.updateUserById).toHaveBeenLastCalledWith("id-me", { app_metadata: { role: "admin" } })
    await setAdminRole(client, "me@gmail.com", DOMAIN, false)
    expect(api.updateUserById).toHaveBeenLastCalledWith("id-me", { app_metadata: { role: null } })
  })

  it("refuses alias accounts and unknown emails", async () => {
    const { client } = fakeAdmin([aliasUser("amira01")])
    await expect(setAdminRole(client, `amira01@${DOMAIN}`, DOMAIN, true)).rejects.toThrow(/can't be admins/)
    await expect(setAdminRole(client, "nobody@gmail.com", DOMAIN, true)).rejects.toThrow(/Sign up with it first/)
  })
})
