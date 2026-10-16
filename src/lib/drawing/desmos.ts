"use client"

/**
 * Loads the Desmos graphing calculator script once per page and exposes the
 * small part of its API the graph shape uses. Resolves to null when Desmos
 * isn't configured (no DESMOS_KEY) or can't be reached, so callers can show a
 * fallback instead of failing.
 */

export interface DesmosExpressionState {
  id?: string
  type?: string
  latex?: string
  color?: string
  label?: string
  showLabel?: boolean
}

export interface DesmosCalculator {
  setExpression(state: DesmosExpressionState): void
  removeExpression(state: { id: string }): void
  getExpressions(): DesmosExpressionState[]
  setMathBounds(bounds: { left: number; right: number; bottom: number; top: number }): void
  updateSettings(settings: Record<string, unknown>): void
  observeEvent(event: "change", callback: (eventName: string, event: { isUserInitiated: boolean }) => void): void
  unobserveEvent(event: "change"): void
  destroy(): void
}

export interface DesmosApi {
  GraphingCalculator(element: HTMLElement, options?: Record<string, unknown>): DesmosCalculator
}

declare global {
  interface Window {
    Desmos?: DesmosApi
  }
}

let loading: Promise<DesmosApi | null> | null = null

export function loadDesmos(): Promise<DesmosApi | null> {
  if (typeof window === "undefined") return Promise.resolve(null)
  if (window.Desmos) return Promise.resolve(window.Desmos)
  loading ??= (async () => {
    try {
      const response = await fetch("/api/desmos", { cache: "no-store" })
      if (!response.ok) return null
      const { scriptUrl } = (await response.json()) as { scriptUrl?: string }
      if (!scriptUrl || !scriptUrl.startsWith("https://www.desmos.com/api/")) return null
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script")
        script.src = scriptUrl
        script.async = true
        script.onload = () => resolve()
        script.onerror = () => reject(new Error("Desmos failed to load"))
        document.head.appendChild(script)
      })
      return window.Desmos ?? null
    } catch {
      loading = null // allow a later retry (e.g. after reconnecting)
      return null
    }
  })()
  return loading
}
