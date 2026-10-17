import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { getCurrentUser } from "@/lib/auth/session"
import { getLatestWhiteboard } from "@/lib/whiteboards/data"
import { createWhiteboardAction } from "@/app/dashboard/actions"

// Button treatments from the original landing page:
// pill CTA → RecifeAI/src/components/Navbar.tsx; hero buttons → HeroEmailCapture.tsx.
const NAV_PILL =
  "flex h-[45px] items-center rounded-full bg-blue-600 px-[18px] text-[14px] font-medium text-white transition-all duration-[180ms] ease-out hover:-translate-y-[1.5px] hover:bg-blue-700"
const NAV_PILL_SHADOW = { boxShadow: "0 1px 2px rgba(37,99,235,0.15), 0 4px 14px -4px rgba(37,99,235,0.35)" }
const NAV_GHOST = "hidden px-3 py-2 text-[14px] font-normal text-gray-400 transition-colors duration-[180ms] hover:text-gray-700 md:block"
const HERO_PRIMARY =
  "btn-press flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-7 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-blue-700 sm:w-auto"
const HERO_SECONDARY =
  "btn-press flex w-full items-center justify-center rounded-xl px-7 py-3.5 text-[15px] font-semibold text-ink-secondary transition-colors hover:text-ink sm:w-auto"

/**
 * The signed-in student's way back into the whiteboard: their most recent
 * board, or a brand-new one if they haven't made any yet.
 */
async function OpenWhiteboard({ className, style, children }: { className: string; style?: React.CSSProperties; children: React.ReactNode }) {
  const latest = await getLatestWhiteboard().catch(() => null)
  if (latest) {
    return (
      <Link href={`/board/${latest.id}`} className={className} style={style}>
        {children}
      </Link>
    )
  }
  return (
    <form action={createWhiteboardAction}>
      <button type="submit" className={className} style={style}>
        {children}
      </button>
    </form>
  )
}

export async function NavActions() {
  const user = await getCurrentUser()
  if (!user) {
    return (
      <>
        <Link href="/sign-in" className={NAV_GHOST}>
          Log in
        </Link>
        <Link href="/sign-up" className={NAV_PILL} style={NAV_PILL_SHADOW}>
          Get started
        </Link>
      </>
    )
  }
  return (
    <>
      <Link href="/dashboard" className={NAV_GHOST}>
        Dashboard
      </Link>
      <OpenWhiteboard className={NAV_PILL} style={NAV_PILL_SHADOW}>
        Open whiteboard
      </OpenWhiteboard>
    </>
  )
}

export function NavActionsFallback() {
  return <span aria-hidden className="block h-[45px] w-[120px] animate-pulse rounded-full bg-gray-100" />
}

export async function HeroActions() {
  const user = await getCurrentUser()
  if (!user) {
    return (
      <>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/sign-up" className={HERO_PRIMARY}>
            Get started
          </Link>
          <a href="#product" className={HERO_SECONDARY}>
            See how it works ↓
          </a>
        </div>
        <p className="mt-4 text-[13px] text-ink-muted">
          Use a personal email, or the{" "}
          <Link href="/alias" className="underline decoration-ink-faint underline-offset-2 transition-colors hover:text-ink-secondary">
            student alias
          </Link>{" "}
          your school gave you.
        </p>
      </>
    )
  }
  return (
    <>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <OpenWhiteboard className={HERO_PRIMARY}>
          Open whiteboard <ArrowRight className="h-4 w-4" aria-hidden />
        </OpenWhiteboard>
        <Link href="/dashboard" className={HERO_SECONDARY}>
          Go to dashboard
        </Link>
      </div>
      <p className="mt-4 text-[13px] text-ink-muted">
        Signed in{user.accountType === "alias" && user.alias ? ` as ${user.alias}` : ""}. Your whiteboards are saved to your account.
      </p>
    </>
  )
}

export function HeroActionsFallback() {
  return (
    <div aria-hidden className="mt-8 flex flex-col items-center gap-3">
      <span className="block h-[52px] w-full max-w-[180px] animate-pulse rounded-xl bg-gray-100" />
      <span className="block h-4 w-64 animate-pulse rounded bg-gray-100" />
    </div>
  )
}

export async function ClosingActions() {
  const user = await getCurrentUser()
  if (user) {
    return (
      <OpenWhiteboard className={HERO_PRIMARY}>
        Open whiteboard <ArrowRight className="h-4 w-4" aria-hidden />
      </OpenWhiteboard>
    )
  }
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row">
      <Link href="/sign-up" className={HERO_PRIMARY}>
        Create an account
      </Link>
      <Link href="/alias" className={HERO_SECONDARY}>
        I have a student alias
      </Link>
    </div>
  )
}
