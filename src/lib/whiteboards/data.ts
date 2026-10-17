import "server-only"
import { createClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth/session"

export interface WhiteboardSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface Whiteboard extends WhiteboardSummary {
  snapshot: unknown | null
}

export const TITLE_MAX_LENGTH = 80
/** Generous cap on a saved tldraw document; pasted question images make up most of it. */
export const SNAPSHOT_MAX_BYTES = 8 * 1024 * 1024

interface Row {
  id: string
  title: string
  created_at: string
  updated_at: string
  snapshot?: unknown
}

const toSummary = (row: Row): WhiteboardSummary => ({
  id: row.id,
  title: row.title,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export function cleanTitle(raw: string): string {
  const title = raw.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX_LENGTH)
  return title || "Untitled whiteboard"
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isWhiteboardId = (id: string) => UUID.test(id)

// Every function below resolves the signed-in student first and filters on
// their id. Row-level security enforces the same rule in the database, so a
// bug here can't expose another student's boards.

export async function listWhiteboards(): Promise<WhiteboardSummary[]> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("whiteboards")
    .select("id, title, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(200)
  if (error) throw new Error(`listWhiteboards: ${error.message}`)
  return (data as Row[]).map(toSummary)
}

/** The student's most recently edited board (for "Open whiteboard" CTAs), or null. */
export async function getLatestWhiteboard(): Promise<WhiteboardSummary | null> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("whiteboards")
    .select("id, title, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`getLatestWhiteboard: ${error.message}`)
  return data ? toSummary(data as Row) : null
}

export async function getWhiteboard(id: string): Promise<Whiteboard | null> {
  if (!isWhiteboardId(id)) return null
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("whiteboards")
    .select("id, title, created_at, updated_at, snapshot")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle()
  if (error) throw new Error(`getWhiteboard: ${error.message}`)
  if (!data) return null
  return { ...toSummary(data as Row), snapshot: (data as Row).snapshot ?? null }
}

export async function createWhiteboard(title = "Untitled whiteboard"): Promise<string> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("whiteboards")
    .insert({ user_id: user.id, title: cleanTitle(title) })
    .select("id")
    .single()
  if (error) throw new Error(`createWhiteboard: ${error.message}`)
  return data.id as string
}

export async function renameWhiteboard(id: string, title: string): Promise<boolean> {
  if (!isWhiteboardId(id)) return false
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("whiteboards")
    .update({ title: cleanTitle(title) })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
  if (error) throw new Error(`renameWhiteboard: ${error.message}`)
  return data.length > 0
}

export async function deleteWhiteboard(id: string): Promise<boolean> {
  if (!isWhiteboardId(id)) return false
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("whiteboards")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
  if (error) throw new Error(`deleteWhiteboard: ${error.message}`)
  return data.length > 0
}

export async function saveWhiteboardSnapshot(id: string, snapshot: unknown): Promise<string | null> {
  if (!isWhiteboardId(id)) return null
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("whiteboards")
    .update({ snapshot })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("updated_at")
    .maybeSingle()
  if (error) throw new Error(`saveWhiteboardSnapshot: ${error.message}`)
  return data ? (data.updated_at as string) : null
}
