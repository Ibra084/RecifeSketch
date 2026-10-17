import { Reveal } from "./reveal"

// Layout, icon tiles and numbering from RecifeAI/src/components/HowItWorks.tsx.
const steps = [
  {
    n: "01",
    title: "Sketch the problem",
    body: "Write it out, draw a diagram, or paste a photo of the question straight onto your board.",
    icon: <path d="M4 18c3-1 5-6 8-9s5-3 6-2-1 3-3 4M4 21h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    n: "02",
    title: "Ask Recife",
    body: "Tap the orb and ask. Select part of your working first to ask about exactly that.",
    icon: (
      <>
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" fill="none" />
        <path d="M12 8.5v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
  },
  {
    n: "03",
    title: "See it explained on the board",
    body: "Recife draws, annotates and explains one step at a time, right next to your work.",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
        <path d="M7 13l3-3 2.5 2L17 8M9 21h6M12 17v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-24 px-5 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <div className="mb-14 max-w-md sm:mb-20">
          <Reveal>
            <p className="mb-3 text-[13px] font-semibold text-blue-600">How it works</p>
          </Reveal>
          <Reveal delay={60}>
            <h2 id="how-heading" className="text-3xl font-bold leading-[1.1] tracking-tight text-ink sm:text-4xl">
              Draw it. Ask it. Get it.
            </h2>
          </Reveal>
        </div>

        <ol className="grid gap-x-8 gap-y-12 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.n}>
              <Reveal delay={i * 100}>
                <div className="flex gap-4 sm:flex-col sm:gap-0">
                  <div className="flex shrink-0 items-center justify-between sm:mb-6">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-sunken text-ink-secondary">
                      <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden>
                        {s.icon}
                      </svg>
                    </span>
                    <span className="hidden text-[13px] font-bold tabular-nums text-ink-faint sm:inline">{s.n}</span>
                  </div>
                  <div>
                    <h3 className="mb-1.5 text-[17px] font-semibold text-ink">{s.title}</h3>
                    <p className="max-w-[260px] text-[14px] leading-relaxed text-ink-secondary">{s.body}</p>
                  </div>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
