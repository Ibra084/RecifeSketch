"use client"

import dynamic from "next/dynamic"

// tldraw is browser-only; never render it on the server.
const DrawingHarness = dynamic(
  () => import("./drawing-harness").then((mod) => mod.DrawingHarness),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-dvh w-full items-center justify-center text-sm text-ink-muted">
        Loading drawing harness…
      </div>
    ),
  }
)

export function DrawingHarnessShell() {
  return <DrawingHarness />
}
