import "server-only"
import { DEFAULT_ALIAS_EMAIL_DOMAIN } from "./identity"

/**
 * Server-only Supabase configuration. None of these are NEXT_PUBLIC_: every
 * Supabase call in Recife Sketch goes through server actions, route handlers
 * or the proxy, so the browser never needs (or receives) a Supabase key.
 */
export interface AuthConfig {
  supabaseUrl: string
  supabaseAnonKey: string
  siteUrl: string
  aliasEmailDomain: string
}

export function readAuthConfig(): AuthConfig | null {
  const supabaseUrl = process.env.SUPABASE_URL?.trim()
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY?.trim()
  if (!supabaseUrl || !supabaseAnonKey) return null
  return {
    supabaseUrl,
    supabaseAnonKey,
    siteUrl: (process.env.SITE_URL?.trim() || "http://localhost:3000").replace(/\/$/, ""),
    aliasEmailDomain: process.env.ALIAS_EMAIL_DOMAIN?.trim().toLowerCase() || DEFAULT_ALIAS_EMAIL_DOMAIN,
  }
}

export function requireAuthConfig(): AuthConfig {
  const config = readAuthConfig()
  if (!config) throw new AuthNotConfiguredError()
  return config
}

export function readServiceRoleKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null
}

export class AuthNotConfiguredError extends Error {
  constructor() {
    super("Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.local.")
    this.name = "AuthNotConfiguredError"
  }
}
