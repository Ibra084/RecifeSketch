import { describe, expect, it } from "vitest"
import {
  aliasFromEmail,
  aliasToEmail,
  DEFAULT_ALIAS_EMAIL_DOMAIN,
  isBlockedEmailDomain,
  isValidAlias,
  parseIdentifier,
  passwordProblem,
  safeNextPath,
} from "./identity"

describe("isBlockedEmailDomain", () => {
  const blocked = ["jess.sch.ae"]

  it("blocks the school domain regardless of case and whitespace", () => {
    expect(isBlockedEmailDomain("student@jess.sch.ae", blocked)).toBe(true)
    expect(isBlockedEmailDomain("  Student@JESS.SCH.AE ", blocked)).toBe(true)
  })

  it("blocks subdomains of a blocked domain", () => {
    expect(isBlockedEmailDomain("a@students.jess.sch.ae", blocked)).toBe(true)
  })

  it("does not block lookalike or personal domains", () => {
    expect(isBlockedEmailDomain("a@notjess.sch.ae", blocked)).toBe(false)
    expect(isBlockedEmailDomain("a@jess.sch.ae.example.com", blocked)).toBe(false)
    expect(isBlockedEmailDomain("a@gmail.com", blocked)).toBe(false)
  })

  it("tolerates leading @ and blank entries in the configured list", () => {
    expect(isBlockedEmailDomain("a@jess.sch.ae", ["", "@jess.sch.ae"])).toBe(true)
    expect(isBlockedEmailDomain("a@gmail.com", [""])).toBe(false)
  })
})

describe("aliases", () => {
  it("accepts simple administrator-issued handles", () => {
    expect(isValidAlias("maths7b-amira")).toBe(true)
    expect(isValidAlias("y9.student01")).toBe(true)
  })

  it("rejects too-short, badly-bounded or doubled-separator handles", () => {
    expect(isValidAlias("ab")).toBe(false)
    expect(isValidAlias("-amira")).toBe(false)
    expect(isValidAlias("amira.")).toBe(false)
    expect(isValidAlias("am..ira")).toBe(false)
    expect(isValidAlias("amira rahman")).toBe(false)
  })

  it("round-trips through the reserved alias email domain", () => {
    const email = aliasToEmail("Maths7B-Amira")
    expect(email).toBe(`maths7b-amira@${DEFAULT_ALIAS_EMAIL_DOMAIN}`)
    expect(aliasFromEmail(email)).toBe("maths7b-amira")
    expect(aliasFromEmail("someone@gmail.com")).toBeNull()
  })
})

describe("parseIdentifier", () => {
  it("treats input with @ as a personal email", () => {
    expect(parseIdentifier(" Me@Gmail.com ")).toEqual({ kind: "email", email: "me@gmail.com" })
  })

  it("treats input without @ as a student alias", () => {
    expect(parseIdentifier("maths7b-amira")).toEqual({
      kind: "alias",
      alias: "maths7b-amira",
      email: `maths7b-amira@${DEFAULT_ALIAS_EMAIL_DOMAIN}`,
    })
  })

  it("recognises a typed-out alias email as an alias", () => {
    expect(parseIdentifier(`amira01@${DEFAULT_ALIAS_EMAIL_DOMAIN}`)?.kind).toBe("alias")
  })

  it("rejects malformed input", () => {
    expect(parseIdentifier("")).toBeNull()
    expect(parseIdentifier("not an alias")).toBeNull()
    expect(parseIdentifier("me@nodot")).toBeNull()
  })
})

describe("passwordProblem", () => {
  it("requires length and a letter + number mix", () => {
    expect(passwordProblem("short1")).toMatch(/at least/)
    expect(passwordProblem("onlyletters")).toMatch(/letter and one number/)
    expect(passwordProblem("12345678")).toMatch(/letter and one number/)
    expect(passwordProblem("whiteboard7")).toBeNull()
    expect(passwordProblem(`a1${"x".repeat(80)}`)).toMatch(/at most/)
  })
})

describe("safeNextPath", () => {
  it("allows same-origin paths and rejects everything else", () => {
    expect(safeNextPath("/board/abc")).toBe("/board/abc")
    expect(safeNextPath(null)).toBe("/dashboard")
    expect(safeNextPath("https://evil.example")).toBe("/dashboard")
    expect(safeNextPath("//evil.example")).toBe("/dashboard")
    expect(safeNextPath("/\\evil.example")).toBe("/dashboard")
  })
})
