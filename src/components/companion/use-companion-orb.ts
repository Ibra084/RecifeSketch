"use client"

import { useCallback, useRef, useState } from "react"
import { viewportPoint, viewportRect, type ViewportPoint, type ViewportRect, type ViewportSize } from "@/lib/overlay/coordinates"
import { clampToViewport, placeOrbNear } from "@/lib/overlay/placement"

export const ORB_SIZE = 56
const STORAGE_KEY = "recife-sketch-orb-v1"

function loadHome(): ViewportPoint | null {
  if (typeof window === "undefined") return null
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null")
    return raw && Number.isFinite(raw.x) && Number.isFinite(raw.y) ? viewportPoint(raw.x, raw.y) : null
  } catch {
    return null
  }
}

/** Bottom-right, clear of the centred toolbar. */
function defaultHome(viewport: ViewportSize): ViewportPoint {
  return viewportPoint(viewport.w - ORB_SIZE - 24, viewport.h - ORB_SIZE - 104)
}

/**
 * The companion orb lives in viewport space: it stays put on screen while
 * the student pans and zooms. It glides toward content while explaining,
 * unless the student has grabbed it this turn - their placement always wins.
 */
export function useCompanionOrb(viewport: ViewportSize | null) {
  const [home, setHome] = useState<ViewportPoint | null>(loadHome)
  const [target, setTarget] = useState<ViewportPoint | null>(null)
  const userOverrideRef = useRef(false)

  const clamp = (p: ViewportPoint) =>
    viewport ? clampToViewport(viewportRect(p.x, p.y, ORB_SIZE, ORB_SIZE), viewport) : p

  const resolvedHome = viewport ? clamp(home ?? defaultHome(viewport)) : null
  const position = viewport ? clamp(target ?? resolvedHome!) : null

  const placeByUser = useCallback((p: ViewportPoint) => {
    userOverrideRef.current = true
    setTarget(null)
    setHome(p)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: p.x, y: p.y }))
    } catch {
      // Not persisted; still works this session.
    }
  }, [])

  const glideNear = useCallback(
    (anchor: ViewportRect, avoid: ViewportRect[]) => {
      if (userOverrideRef.current || !viewport) return
      setTarget(placeOrbNear(anchor, ORB_SIZE, viewport, avoid))
    },
    [viewport]
  )

  /** End of an explanation: release any manual override and drift back home. */
  const endTurn = useCallback(() => {
    userOverrideRef.current = false
    setTarget(null)
  }, [])

  return { position, placeByUser, glideNear, endTurn }
}
