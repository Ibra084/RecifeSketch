"use client"

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
]

export function formatRelative(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000)
  if (Math.abs(seconds) < 60) return "just now"
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" })
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit)
  }
  return "just now"
}

/** Server and browser clocks differ slightly, so the text may legitimately change on hydrate. */
export function RelativeTime({ iso, prefix }: { iso: string; prefix?: string }) {
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString()} suppressHydrationWarning>
      {prefix}
      {formatRelative(iso)}
    </time>
  )
}
