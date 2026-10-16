import { describe, expect, it, vi } from "vitest"
import type { User } from "@supabase/supabase-js"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("next/server", () => ({ connection: vi.fn() }))

const { toCurrentUser } = await import("./session")

const DOMAIN = "alias.recife-sketch.invalid"

function user(email: string, appMeta: Record<string, unknown>, userMeta: Record<string, unknown> = {}) {
  return { id: "u1", email, app_metadata: appMeta, user_metadata: userMeta } as unknown as User
}

describe("toCurrentUser", () => {
  it("maps a personal account", () => {
    expect(toCurrentUser(user("me@gmail.com", {}), DOMAIN)).toEqual({
      id: "u1",
      accountType: "personal",
      email: "me@gmail.com",
      alias: null,
      mustChangePassword: false,
      isAdmin: false,
    })
  })

  it("grants admin only from app_metadata, and never to alias accounts", () => {
    expect(toCurrentUser(user("me@gmail.com", { role: "admin" }), DOMAIN).isAdmin).toBe(true)
    expect(toCurrentUser(user("me@gmail.com", {}, { role: "admin" }), DOMAIN).isAdmin).toBe(false)
    expect(
      toCurrentUser(user(`amira01@${DOMAIN}`, { account_type: "alias", role: "admin" }), DOMAIN).isAdmin
    ).toBe(false)
    // An alias-domain address without the alias flag still can't be an admin.
    expect(toCurrentUser(user(`x01@${DOMAIN}`, { role: "admin" }), DOMAIN).isAdmin).toBe(false)
  })

  it("maps an administrator-issued alias account with a pending password change", () => {
    expect(
      toCurrentUser(user(`amira01@${DOMAIN}`, { account_type: "alias", must_change_password: true }), DOMAIN)
    ).toMatchObject({ accountType: "alias", alias: "amira01", email: null, mustChangePassword: true })
  })

  it("ignores student-writable user_metadata when deciding the account type", () => {
    const forged = user("me@gmail.com", {}, { account_type: "alias", must_change_password: false })
    expect(toCurrentUser(forged, DOMAIN).accountType).toBe("personal")
  })

  it("requires both the admin flag and the reserved domain for an alias", () => {
    expect(toCurrentUser(user("me@gmail.com", { account_type: "alias" }), DOMAIN).accountType).toBe("personal")
    expect(toCurrentUser(user(`x01@${DOMAIN}`, {}), DOMAIN).accountType).toBe("personal")
  })
})
