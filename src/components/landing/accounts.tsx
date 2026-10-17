import { Suspense } from "react"
import { Mail, ShieldCheck, UserRound } from "lucide-react"
import { Reveal } from "./reveal"
import { ClosingActions, HeroActionsFallback } from "./landing-ctas"

// Two-column layout from RecifeAI/src/components/About.tsx.
const POINTS = [
  {
    icon: Mail,
    title: "Personal email",
    body: "Sign up with your own email and verify it. School email addresses can't be used.",
  },
  {
    icon: UserRound,
    title: "Student alias",
    body: "No personal email? Your teacher or school administrator gives you an alias and a temporary password. You choose your own password the first time you sign in.",
  },
  {
    icon: ShieldCheck,
    title: "Nothing you don't need to share",
    body: "No real names. Your whiteboards are private to your account, and you can delete them any time.",
  },
]

export function Accounts() {
  return (
    <section id="accounts" aria-labelledby="accounts-heading" className="scroll-mt-24 px-5 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto grid max-w-5xl items-start gap-10 md:grid-cols-[1fr_1.3fr] md:gap-16">
        <Reveal>
          <p className="mb-3 text-[13px] font-semibold text-blue-600">Accounts</p>
          <h2 id="accounts-heading" className="text-3xl font-bold leading-[1.1] tracking-tight text-ink">
            Made for students. Simple for schools.
          </h2>
        </Reveal>

        <Reveal delay={100}>
          <ul className="space-y-6">
            {POINTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-sunken text-ink-secondary">
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                </span>
                <div>
                  <h3 className="text-[16px] font-semibold text-ink">{title}</h3>
                  <p className="mt-1 text-[15px] leading-relaxed text-ink-secondary">{body}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <Suspense fallback={<HeroActionsFallback />}>
              <ClosingActions />
            </Suspense>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
