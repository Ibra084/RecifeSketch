import { connection, NextResponse } from "next/server"

/**
 * Where the browser loads the Desmos calculator from. The key is read from
 * the server's environment (DESMOS_KEY in .env.local) at request time, so it
 * is never committed or compiled into the client bundle. Desmos keys are
 * browser keys by design, though: the calculator script is loaded by the
 * student's browser with the key in its URL, so it is visible there.
 */

const DESMOS_API_VERSION = "v1.11"

export async function GET() {
  // Per request, never prerendered - so the key can't end up in a static build file.
  await connection()
  const key = process.env.DESMOS_KEY?.trim()
  if (!key) {
    return NextResponse.json({ ok: false }, { status: 404, headers: { "Cache-Control": "no-store" } })
  }
  return NextResponse.json(
    { ok: true, scriptUrl: `https://www.desmos.com/api/${DESMOS_API_VERSION}/calculator.js?apiKey=${encodeURIComponent(key)}` },
    { headers: { "Cache-Control": "private, no-store" } }
  )
}
