"use client"

import { useSearchParams } from "next/navigation"
import { confirmEmailLinkAction } from "@/app/(auth)/actions"
import { SubmitButton } from "./fields"

/**
 * The button behind an email link. Mail scanners (Outlook Safe Links and the
 * like) open every link in an email before the student does; if opening the
 * link used it up, the student's own click would then fail. Only this form's
 * POST uses the link, and scanners don't submit forms.
 */
export function ConfirmLinkForm() {
  const params = useSearchParams()
  const recovery = params.get("type") === "recovery"
  return (
    <form action={confirmEmailLinkAction} className="flex flex-col gap-3.5">
      <input type="hidden" name="token_hash" value={params.get("token_hash") ?? ""} />
      <input type="hidden" name="type" value={params.get("type") ?? ""} />
      <input type="hidden" name="next" value={params.get("next") ?? ""} />
      <SubmitButton pendingLabel={recovery ? "Opening…" : "Confirming…"}>
        {recovery ? "Choose a new password" : "Confirm my email"}
      </SubmitButton>
    </form>
  )
}
