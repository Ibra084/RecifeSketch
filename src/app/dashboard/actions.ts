"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createWhiteboard, deleteWhiteboard, renameWhiteboard } from "@/lib/whiteboards/data"

export async function createWhiteboardAction(): Promise<void> {
  const id = await createWhiteboard()
  redirect(`/board/${id}`)
}

export async function renameWhiteboardAction(id: string, title: string): Promise<{ ok: boolean }> {
  const ok = await renameWhiteboard(id, title)
  revalidatePath("/dashboard")
  return { ok }
}

export async function deleteWhiteboardAction(id: string): Promise<{ ok: boolean }> {
  const ok = await deleteWhiteboard(id)
  revalidatePath("/dashboard")
  return { ok }
}
