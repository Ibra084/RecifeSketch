import { Suspense } from "react"
import type { Metadata } from "next"
import { Accounts } from "@/components/landing/accounts"
import { Features } from "@/components/landing/features"
import { HowItWorks } from "@/components/landing/how-it-works"
import { HeroActions, HeroActionsFallback, NavActions, NavActionsFallback } from "@/components/landing/landing-ctas"
import { LandingFooter } from "@/components/landing/landing-footer"
import { LandingNav } from "@/components/landing/landing-nav"
import { ProductPreview } from "@/components/landing/product-preview"

export const metadata: Metadata = {
  title: "Recife Sketch · Think it. Sketch it. Understand it.",
  description:
    "An infinite whiteboard with an AI tutor that works alongside you. Draw, solve problems and get visual explanations exactly where you need them.",
}

/**
 * Public homepage, adapted from the Recife AI landing page (RecifeAI/src/App.tsx
 * `Landing`): Navbar → Hero + ProductPreview → HowItWorks → Features → About-style
 * accounts section → Footer. Everything is static except the auth-aware CTAs,
 * which stream in behind Suspense.
 */
export default function Home() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <LandingNav
        actions={
          <Suspense fallback={<NavActionsFallback />}>
            <NavActions />
          </Suspense>
        }
      />

      <main>
        {/* Hero: RecifeAI/src/components/Hero.tsx */}
        <section aria-labelledby="hero-heading" className="px-5 pb-16 pt-36 sm:px-6 sm:pb-24 sm:pt-44">
          <div className="mx-auto max-w-3xl text-center">
            <h1
              id="hero-heading"
              className="text-[42px] font-bold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[58px] sm:leading-[1.03] lg:text-[72px] lg:leading-[0.98]"
            >
              Think it. Sketch it.
              <br className="hidden sm:block" /> Understand it.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-ink-secondary sm:text-lg">
              An infinite whiteboard with an AI tutor that works alongside you. Draw, solve problems and get visual
              explanations exactly where you need them.
            </p>
            <Suspense fallback={<HeroActionsFallback />}>
              <HeroActions />
            </Suspense>
          </div>

          <div id="product" className="mx-auto mt-16 max-w-3xl scroll-mt-24 sm:mt-24">
            <ProductPreview />
          </div>
        </section>

        <HowItWorks />
        <Features />
        <Accounts />
      </main>

      <LandingFooter />
    </div>
  )
}
