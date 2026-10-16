import Link from "next/link"
import { RecifeWordmark } from "@/components/brand/recife-wordmark"

// Structure from RecifeAI/src/components/Footer.tsx, with Recife Sketch's routes.
const LINKS = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "Features", href: "/#features" },
  { label: "Accounts", href: "/#accounts" },
  { label: "Log in", href: "/sign-in" },
  { label: "Create account", href: "/sign-up" },
  { label: "Student alias", href: "/alias" },
]

export function LandingFooter() {
  return (
    <footer className="hairline border-t px-5 pb-8 pt-14 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 flex flex-col items-start justify-between gap-10 sm:flex-row">
          <div>
            <RecifeWordmark showProduct />
            <p className="mt-3 max-w-52 text-[13px] leading-relaxed text-ink-muted">
              The AI whiteboard tutor that teaches by drawing.
            </p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-14 gap-y-3 sm:grid-cols-3">
            {LINKS.map(({ label, href }) => (
              <Link key={label} href={href} className="text-[13px] text-ink-secondary transition-colors hover:text-ink">
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="hairline flex flex-col items-start justify-between gap-3 border-t pt-6 sm:flex-row sm:items-center">
          <p className="text-[12px] text-ink-muted">© 2026 Recife</p>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="text-[12px] text-ink-muted transition-colors hover:text-ink">
              Privacy
            </Link>
            <Link href="/terms" className="text-[12px] text-ink-muted transition-colors hover:text-ink">
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
