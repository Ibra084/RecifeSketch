/**
 * Quietly keeps what a bug report needs, in memory only (nothing is sent until
 * the student presses Send):
 * - the last 50 console warnings/errors and uncaught errors;
 * - the last few tutor exchanges (/api/tutor and its second look), with image
 *   data stripped - observed by wrapping fetch, so the tutor code itself is
 *   untouched.
 * Installed once per page.
 */

export interface ConsoleEntry { level: string; message: string; at: string }

const MAX_CONSOLE = 50
const MAX_EXCHANGES = 4
const consoleEntries: ConsoleEntry[] = []
const exchanges: { at: string; url: string; request: unknown; response: unknown }[] = []
let installed = false

function text(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}${value.stack ? `\n${value.stack.split("\n").slice(1, 4).join("\n")}` : ""}`
  if (typeof value === "string") return value
  try { return JSON.stringify(value) } catch { return String(value) }
}

function remember(level: string, args: unknown[]) {
  consoleEntries.push({ level, message: args.map(text).join(" ").slice(0, 2000), at: new Date().toISOString() })
  if (consoleEntries.length > MAX_CONSOLE) consoleEntries.shift()
}

/** Large base64 image data replaced with its size, so reports stay small and image-free. */
function withoutImageData(value: unknown): unknown {
  if (typeof value === "string") return value.length > 2000 && /^[A-Za-z0-9+/]+={0,2}$/.test(value.slice(0, 200)) ? `<${value.length} chars of image data>` : value
  if (Array.isArray(value)) return value.map(withoutImageData)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withoutImageData(v)]))
  return value
}

export function installBugCollector(): void {
  if (installed || typeof window === "undefined") return
  installed = true

  for (const level of ["error", "warn"] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      remember(level, args)
      original(...args)
    }
  }
  window.addEventListener("error", (event) => remember("uncaught", [event.error ?? event.message]))
  window.addEventListener("unhandledrejection", (event) => remember("unhandled", [event.reason]))

  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const watched = url.startsWith("/api/tutor")
    const response = await originalFetch(input, init)
    if (watched) {
      let request: unknown = null
      try { request = typeof init?.body === "string" ? JSON.parse(init.body) : null } catch { request = null }
      void response.clone().json().then(
        (body: unknown) => {
          exchanges.push({ at: new Date().toISOString(), url, request: withoutImageData(request), response: withoutImageData(body) })
          if (exchanges.length > MAX_EXCHANGES) exchanges.shift()
        },
        () => undefined
      )
    }
    return response
  }
}

export function collectedConsole(): ConsoleEntry[] {
  return [...consoleEntries]
}

/** The recent tutor exchanges as JSON text, or undefined if there were none this session. */
export function collectedTutorExchanges(): string | undefined {
  return exchanges.length > 0 ? JSON.stringify(exchanges, null, 2) : undefined
}
