"use client"

import { useEffect, useState, type ReactNode } from "react"
import { RecifeWordmark } from "@/components/brand/recife-wordmark"

const NAV_LINKS = [
  { label: "How it works", id: "how-it-works" },
  { label: "Features", id: "features" },
  { label: "Accounts", id: "accounts" },
]

/**
 * Floating glass pill nav from RecifeAI/src/components/Navbar.tsx: inset
 * 20px-radius bar that firms up on scroll, with scroll-spy active links.
 * `actions` is the auth-aware CTA group, rendered on the server.
 */
export function LandingNav({ actions }: { actions: ReactNode }) {
  const [scrolled, setScrolled] = useState(false)
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    const sections = NAV_LINKS.map(({ id }) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null
    )
    if (sections.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id)
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    )
    sections.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <div className="fixed inset-x-0 top-4 z-50 px-4 sm:top-5">
      <nav
        aria-label="Main"
        className="mx-auto max-w-[1280px] rounded-[20px] border transition-all duration-[220ms] ease-out"
        style={{
          borderColor: scrolled ? "rgba(15,23,42,0.07)" : "rgba(15,23,42,0.05)",
          background: scrolled ? "rgba(255,255,255,0.78)" : "rgba(255,255,255,0.6)",
          backdropFilter: scrolled ? "blur(18px)" : "blur(10px)",
          WebkitBackdropFilter: scrolled ? "blur(18px)" : "blur(10px)",
          boxShadow: scrolled ? "0 4px 20px -8px rgba(15,23,42,0.08)" : "0 1px 6px -2px rgba(15,23,42,0.04)",
        }}
      >
        <div className="flex h-[58px] items-center justify-between gap-3 px-4 sm:px-6">
          <RecifeWordmark size="md" showProduct className="min-w-0" />

          <div className="hidden items-center gap-0.5 md:flex">
            {NAV_LINKS.map(({ label, id }) => {
              const isActive = active === id
              return (
                <a
                  key={id}
                  href={`#${id}`}
                  aria-current={isActive ? "true" : undefined}
                  className={`relative rounded-full px-4 py-2 text-[15px] font-medium transition-all duration-[180ms] ease-out hover:-translate-y-px ${
                    isActive
                      ? "bg-blue-50/80 text-blue-600"
                      : "text-gray-600 hover:bg-gray-500/[0.06] hover:text-gray-900"
                  }`}
                >
                  {label}
                </a>
              )
            })}
          </div>

          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        </div>
      </nav>
    </div>
  )
}
