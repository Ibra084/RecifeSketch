import Link from "next/link"
import type { ReactNode } from "react"
import { cn } from "cn"

/**
 * The glass card from the original Recife AI auth overlay
 * (RecifeAI/src/components/AuthOverlay.tsx): 408px, 28px radius,
 * white/82 with a 28px saturated blur and a soft slate drop shadow,
 * with the panel padding from AuthPanel.tsx.
 */
export function AuthCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "animate-auth-card-in w-full max-w-[408px] rounded-[28px] border px-6 pb-6 pt-6 sm:px-7",
        className
      )}
      style={{
        background: "rgba(255,255,255,0.82)",
        backdropFilter: "blur(28px) saturate(160%)",
        WebkitBackdropFilter: "blur(28px) saturate(160%)",
        borderColor: "rgba(255,255,255,0.6)",
        boxShadow:
          "0 20px 60px -18px rgba(15,23,42,0.22), 0 1px 1px rgba(255,255,255,0.5) inset, 0 0 0 1px rgba(15,23,42,0.04)",
      }}
    >
      {children}
    </div>
  )
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 id="auth-panel-title" className="mb-1 text-2xl font-bold tracking-tight text-gray-900">
        {title}
      </h1>
      {subtitle && <p className="text-[15px] leading-relaxed text-gray-400">{subtitle}</p>}
    </div>
  )
}

/** The pill segmented control from AuthPanel.tsx, as links between the two routes. */
export function AuthTabs({ active }: { active: "sign-in" | "sign-up" }) {
  const tab = (href: string, label: string, isActive: boolean) => (
    <Link
      href={href}
      role="tab"
      aria-selected={isActive}
      className={cn(
        "flex-1 rounded-full py-2.5 text-center text-sm font-semibold transition-all duration-200 active:scale-[0.98]",
        isActive
          ? "text-gray-900 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_4px_10px_-4px_rgba(15,23,42,0.12)]"
          : "text-gray-500 hover:bg-black/[0.03] hover:text-gray-700"
      )}
      style={isActive ? { background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)" } : undefined}
    >
      {label}
    </Link>
  )

  return (
    <div
      role="tablist"
      aria-label="Sign in or create an account"
      className="mb-5 flex items-center gap-1 rounded-full border border-black/[0.04] p-1"
      style={{ background: "rgba(15,23,42,0.04)" }}
    >
      {tab("/sign-in", "Sign in", active === "sign-in")}
      {tab("/sign-up", "Create account", active === "sign-up")}
    </div>
  )
}

export function AuthDivider({ children }: { children: ReactNode }) {
  return (
    <div className="my-4 flex items-center gap-3">
      <div className="h-px flex-1 bg-gray-100" />
      <span className="text-xs text-gray-400">{children}</span>
      <div className="h-px flex-1 bg-gray-100" />
    </div>
  )
}

export function AuthFootnote({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-center text-sm text-gray-400">{children}</p>
}

export function TextLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("font-medium text-blue-600 transition-colors duration-150 hover:underline", className)}>
      {children}
    </Link>
  )
}
