"use client"

import { useCallback, useSyncExternalStore } from "react"

/** Fallback when localStorage is blocked, so the toggle still works for this visit. */
const memory = new Map<string, boolean>()

/**
 * A yes/no preference remembered on this device (localStorage). Reads as
 * false on the server and in browsers where storage is blocked, so the page
 * renders the same either way.
 */
export function useDeviceFlag(key: string): [boolean, (value: boolean) => void] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const onStorage = (event: StorageEvent) => { if (event.key === key) onChange() }
      window.addEventListener("storage", onStorage)
      window.addEventListener(`device-flag:${key}`, onChange)
      return () => {
        window.removeEventListener("storage", onStorage)
        window.removeEventListener(`device-flag:${key}`, onChange)
      }
    },
    [key]
  )
  const value = useSyncExternalStore(
    subscribe,
    () => { try { return localStorage.getItem(key) === "1" } catch { return memory.get(key) ?? false } },
    () => false
  )
  const set = useCallback(
    (next: boolean) => {
      try { localStorage.setItem(key, next ? "1" : "0") } catch { memory.set(key, next) }
      window.dispatchEvent(new Event(`device-flag:${key}`))
    },
    [key]
  )
  return [value, set]
}
