"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createWhiteboard, deleteWhiteboard, renameWhiteboard } from "@/lib/whiteboards/data"

/** `boardId` is chosen once by the button, so repeated submits open the same new board rather than making several. */
export async function createWhiteboardAction(formData: FormData): Promise<void> {
  const requested = formData.get("boardId")
  const id = await createWhiteboard(undefined, typeof requested === "string" ? requested : undefined)
  revalidatePath("/dashboard")
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
