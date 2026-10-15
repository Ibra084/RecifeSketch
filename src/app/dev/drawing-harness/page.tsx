import { notFound } from "next/navigation"
import { DrawingHarnessShell } from "@/components/dev/drawing-harness-shell"

// Developer-only: supply raw drawing-protocol JSON and run it against a
// live board without an AI model. Never served in production.
export default function DrawingHarnessPage() {
  if (process.env.NODE_ENV === "production") notFound()
  return <DrawingHarnessShell />
}
