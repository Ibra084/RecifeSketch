import { Suspense } from "react"
import Link from "next/link"
import { Brain, LayoutGrid, LogOut, Settings, ShieldCheck } from "lucide-react"
import { cn } from "cn"
import { RecifeWordmark } from "@/components/brand/recife-wordmark"
import { signOutAction } from "@/app/(auth)/actions"
import { getCurrentUser } from "@/lib/auth/session"

type Section = "dashboard" | "mistakes" | "settings" | "admin"

function navLink(href: string, label: string, Icon: typeof Settings, isActive: boolean) {
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "tap-target flex items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors duration-150 sm:min-h-0 sm:py-2",
        isActive ? "bg-blue-50/80 text-blue-600" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  )
}

/** Only administrators see the Admin link (the page itself also re-checks). */
async function AdminLink({ active }: { active: Section }) {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return null
  return navLink("/admin", "Admin", ShieldCheck, active === "admin")
}

/** Top bar for the signed-in, non-whiteboard pages (dashboard, settings, admin). */
export function AppHeader({ active }: { active: Section }) {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-4xl items-center gap-2 px-4 sm:px-6">
        <RecifeWordmark href="/dashboard" showProduct className="mr-auto" />
        <nav aria-label="Main" className="flex items-center gap-1">
          {navLink("/dashboard", "Whiteboards", LayoutGrid, active === "dashboard")}
          {navLink("/mistakes", "Mistakes", Brain, active === "mistakes")}
          {navLink("/settings", "Settings", Settings, active === "settings")}
          <Suspense fallback={null}>
            <AdminLink active={active} />
          </Suspense>
        </nav>
        <form action={signOutAction}>
          <button
            type="submit"
            className="tap-target flex items-center gap-2 rounded-xl px-3 text-sm font-medium text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700 sm:min-h-0 sm:py-2"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </form>
      </div>
    </header>
  )
}
