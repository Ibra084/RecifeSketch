"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { deleteMistake, saveMistake, startPractice } from "@/lib/mistakes/data"

/** Saves a mistake that "Check my work" verified (the token proves it). */
export async function saveMistakeAction(draft: unknown, token: unknown): Promise<{ ok: boolean; error?: string }> {
  const result = await saveMistake(draft, token)
  if (result.ok) {
    revalidatePath("/dashboard")
    revalidatePath("/mistakes")
  }
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

export async function deleteMistakeAction(formData: FormData): Promise<void> {
  const id = formData.get("mistakeId")
  if (typeof id === "string") await deleteMistake(id)
  revalidatePath("/dashboard")
  revalidatePath("/mistakes")
}

/** "Practice": a new question for the same skill, on its own practice whiteboard. */
export async function practiceMistakeAction(formData: FormData): Promise<void> {
  const id = formData.get("mistakeId")
  const boardId = typeof id === "string" ? await startPractice(id) : null
  if (!boardId) redirect("/mistakes?notice=practice-failed")
  revalidatePath("/dashboard")
  revalidatePath("/mistakes")
  redirect(`/board/${boardId}`)
}
