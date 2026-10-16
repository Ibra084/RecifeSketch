import Link from "next/link"
import { RecifeWordmark } from "@/components/brand/recife-wordmark"

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="auth-backdrop relative flex min-h-dvh flex-col">
      {/* Soft white wash so the dot grid fades out toward the card. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse 60% 55% at 50% 45%, #ffffff 30%, rgba(255,255,255,0) 100%)" }}
      />
      <header className="relative z-10 flex h-16 items-center px-5 sm:px-8">
        <RecifeWordmark href="/" showProduct />
      </header>

      <main className="relative z-10 flex flex-1 items-start justify-center px-4 pb-10 pt-4 sm:items-center sm:pt-0">
        {children}
      </main>

      <footer className="relative z-10 flex items-center justify-center gap-4 pb-6 text-xs text-gray-400">
        <Link href="/terms" className="transition-colors duration-150 hover:text-gray-600">
          Terms
        </Link>
        <span aria-hidden>·</span>
        <Link href="/privacy" className="transition-colors duration-150 hover:text-gray-600">
          Privacy
        </Link>
      </footer>
    </div>
  )
}
