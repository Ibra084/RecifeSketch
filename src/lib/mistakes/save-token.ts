import "server-only"
import { createHmac, timingSafeEqual } from "node:crypto"
import type { MistakeDraft } from "./schema"

/**
 * Only a mistake the server itself verified can be saved: "Check my work"
 * returns the draft together with a signature over (student, draft, time),
 * and saving checks it. So a misconception can't be stored as a confirmed
 * weakness unless the maths checker and the AI agreed on it, for this student,
 * in the last day.
 */

const MAX_AGE_MS = 24 * 60 * 60 * 1000

function key(): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error("server key missing")
  return createHmac("sha256", secret).update("recife-sketch:mistake-memory:v1").digest("hex")
}

function sign(userId: string, draft: MistakeDraft, issuedAt: number): string {
  return createHmac("sha256", key()).update(JSON.stringify([userId, issuedAt, draft])).digest("base64url")
}

export function issueSaveToken(userId: string, draft: MistakeDraft, now = Date.now()): string {
  return `${now}.${sign(userId, draft, now)}`
}

export function verifySaveToken(userId: string, draft: MistakeDraft, token: string, now = Date.now()): boolean {
  const [issued, signature] = token.split(".")
  const issuedAt = Number(issued)
  if (!Number.isFinite(issuedAt) || !signature || now - issuedAt > MAX_AGE_MS || issuedAt > now + 60_000) return false
  const expected = Buffer.from(sign(userId, draft, issuedAt))
  const given = Buffer.from(signature)
  return expected.length === given.length && timingSafeEqual(expected, given)
}
