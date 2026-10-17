import type { ReactNode } from "react"
import {
  ArrowUpRight,
  ChevronLeft,
  Cloud,
  Eraser,
  Hand,
  ImagePlus,
  MousePointer2,
  MousePointerClick,
  Pencil,
  Shapes,
  Sparkles,
  Square,
  Type,
} from "lucide-react"
import { Reveal } from "./reveal"

// Alternating copy/visual rows and the small-card treatment are from
// RecifeAI/src/components/Features.tsx; the visuals show Recife Sketch's UI.

function Row({ eyebrow, title, body, visual, flip = false }: { eyebrow: string; title: string; body: string; visual: ReactNode; flip?: boolean }) {
  return (
    <div className="grid items-center gap-8 md:grid-cols-2 md:gap-16">
      <Reveal className={flip ? "md:order-2" : undefined}>
        <div>
          <p className="mb-3 text-[13px] font-semibold text-blue-600">{eyebrow}</p>
          <h3 className="mb-3 text-2xl font-bold leading-tight tracking-tight text-ink">{title}</h3>
          <p className="max-w-md leading-relaxed text-ink-secondary">{body}</p>
        </div>
      </Reveal>
      <Reveal delay={100} className={flip ? "md:order-1" : undefined}>
        <div className="rounded-2xl bg-surface p-5" style={{ boxShadow: "var(--shadow-soft)" }}>
          {visual}
        </div>
      </Reveal>
    </div>
  )
}

const DOTS = { backgroundImage: "radial-gradient(rgba(24,24,27,0.08) 1px, transparent 1px)", backgroundSize: "16px 16px" }

function WhiteboardVisual() {
  const tools = [MousePointer2, Hand, Pencil, Eraser, ArrowUpRight, Type, Square, ImagePlus]
  return (
    <div aria-hidden>
      <div className="relative h-44 overflow-hidden rounded-xl bg-surface-subtle" style={DOTS}>
        <svg viewBox="0 0 320 176" className="absolute inset-0 h-full w-full">
          <path d="M40 120 Q 80 40 130 98 T 220 70" fill="none" stroke="#3f3f46" strokeWidth="2.2" strokeLinecap="round" />
          <rect x="196" y="98" width="86" height="50" rx="8" fill="none" stroke="#2563eb" strokeWidth="2" />
          <path d="M150 140 L 188 122" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" />
          <circle cx="60" cy="52" r="18" fill="none" stroke="#f59e0b" strokeWidth="2" />
        </svg>
        <span className="absolute right-3 top-3 rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-muted" style={{ boxShadow: "var(--shadow-soft)" }}>
          85%
        </span>
      </div>
      <div className="mx-auto -mt-5 flex w-fit items-center gap-0.5 rounded-xl border border-border-subtle bg-surface p-1" style={{ boxShadow: "var(--shadow-popover)" }}>
        {tools.map((Icon, i) => (
          <span key={i} className={`flex h-8 w-8 items-center justify-center rounded-lg ${i === 2 ? "bg-blue-50 text-blue-600" : "text-ink-secondary"}`}>
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </span>
        ))}
      </div>
    </div>
  )
}

function CompanionVisual() {
  return (
    <div aria-hidden className="relative h-52 overflow-hidden rounded-xl bg-surface-subtle" style={DOTS}>
      <p className="absolute left-5 top-6 font-serif text-[22px] text-blue-700">
        2<i>x</i> = 8
      </p>
      <p className="absolute left-5 top-[68px] font-serif text-[22px] text-blue-700">
        <i>x</i> = 4
      </p>
      <div
        className="absolute left-[46%] top-5 w-[min(220px,50%)] rounded-2xl border border-border-subtle bg-surface px-3 pb-2 pt-2"
        style={{ boxShadow: "var(--shadow-popover)" }}
      >
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-foreground">Step 2 of 2</p>
        <p className="text-[12px] leading-relaxed text-ink">Divide both sides by 2, so x = 4.</p>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="flex items-center text-[11px] font-medium text-ink-secondary">
            <ChevronLeft className="h-3 w-3" /> Back
          </span>
          <span className="rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground">Done</span>
        </div>
      </div>
      <span
        className="absolute bottom-5 left-[30%] flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600"
        style={{ boxShadow: "0 6px 20px rgba(37, 99, 235, 0.35), var(--shadow-soft)" }}
      >
        <Sparkles className="h-5 w-5 text-white" />
      </span>
      <svg className="absolute bottom-7 left-[calc(30%+56px)] h-6 w-24 text-ink-faint" viewBox="0 0 96 24" fill="none">
        <path d="M2 18 C 30 18 50 6 90 6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 4" strokeLinecap="round" />
      </svg>
      <span className="absolute bottom-3 right-4 text-[11px] text-ink-muted">Drag it anywhere</span>
    </div>
  )
}

/** y = x² − 4 sampled exactly; roots at ±2 and the vertex are computed, not drawn by eye. */
function GraphVisual() {
  const sx = (x: number) => 160 + x * 40
  const sy = (y: number) => 100 - y * 14
  const f = (x: number) => x * x - 4
  const points = Array.from({ length: 61 }, (_, i) => -3 + i * 0.1)
    .map((x) => `${sx(x).toFixed(1)},${sy(f(x)).toFixed(1)}`)
    .join(" ")
  const roots = [-2, 2]
  return (
    <div aria-hidden>
      <div className="mb-3 flex items-center justify-between">
        <p className="font-serif text-[15px] text-ink">
          <i>y</i> = <i>x</i>² − 4
        </p>
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600">Plotted exactly</span>
      </div>
      <svg viewBox="0 0 320 170" className="w-full rounded-xl bg-surface-subtle">
        {[-3, -2, -1, 1, 2, 3].map((x) => (
          <line key={x} x1={sx(x)} x2={sx(x)} y1="8" y2="162" stroke="#ececed" />
        ))}
        <line x1="20" x2="300" y1={sy(0)} y2={sy(0)} stroke="#a1a1aa" strokeWidth="1.2" />
        <line x1={sx(0)} x2={sx(0)} y1="8" y2="162" stroke="#a1a1aa" strokeWidth="1.2" />
        <polyline points={points} fill="none" stroke="#2563eb" strokeWidth="2.4" strokeLinejoin="round" />
        {roots.map((r) => (
          <g key={r}>
            <circle cx={sx(r)} cy={sy(0)} r="4" fill="#1d4ed8" />
            {/* Below the axis and outside the roots: the curve never goes there. */}
            <text x={sx(r) + (r < 0 ? -6 : 6)} y={sy(0) + 16} fontSize="12" textAnchor={r < 0 ? "end" : "start"} fill="#1d4ed8" fontFamily="serif">
              ({r}, 0)
            </text>
          </g>
        ))}
        <circle cx={sx(0)} cy={sy(f(0))} r="4" fill="#16a34a" />
        <text x={sx(0) + 8} y={sy(f(0)) + 4} fontSize="12" fill="#15803d" fontFamily="serif">
          (0, −4)
        </text>
      </svg>
    </div>
  )
}

const MORE = [
  {
    icon: Shapes,
    title: "Diagrams and annotations",
    body: "Force diagrams, circuits, lab apparatus, labels and arrows, all drawn as ordinary shapes you can move and edit.",
  },
  {
    icon: MousePointerClick,
    title: "Feedback on your working",
    body: "Select your own working and ask about it. Recife looks at exactly what you selected and replies beside it.",
  },
  {
    icon: Cloud,
    title: "Saved whiteboards",
    body: "Boards save to your account as you work. Rename, delete or pick up where you left off from your dashboard.",
  },
]

export function Features() {
  return (
    <section id="features" aria-labelledby="features-heading" className="scroll-mt-24 bg-surface-subtle px-5 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <div className="mb-16 max-w-lg sm:mb-24">
          <Reveal>
            <p className="mb-3 text-[13px] font-semibold text-blue-600">Inside Recife Sketch</p>
          </Reveal>
          <Reveal delay={60}>
            <h2 id="features-heading" className="text-3xl font-bold leading-[1.1] tracking-tight text-ink sm:text-4xl">
              You do the thinking. Recife draws it out.
            </h2>
          </Reveal>
        </div>

        <div className="space-y-20 sm:space-y-32">
          <Row
            eyebrow="Whiteboard"
            title="A board with no edges"
            body="Draw, write, select, erase, pan and zoom as much as you need. Paste a photo of a worksheet question and work on it right there."
            visual={<WhiteboardVisual />}
          />
          <Row
            flip
            eyebrow="Companion"
            title="A tutor you can move out of the way"
            body="Recife lives in a small orb you can drag anywhere. Ask a question and it glides to the work it's explaining, then talks you through one step at a time in a floating comment. Use Back and Next, then Done when you've got it."
            visual={<CompanionVisual />}
          />
          <Row
            eyebrow="Graphs"
            title="Graphs plotted from the maths, not guessed"
            body="Recife plots graphs from the equation itself, so intercepts, turning points and intersections land exactly where they should."
            visual={<GraphVisual />}
          />
        </div>

        <ul className="mt-20 grid gap-4 sm:mt-28 sm:grid-cols-3">
          {MORE.map(({ icon: Icon, title, body }, i) => (
            <li key={title}>
              <Reveal delay={i * 80} className="h-full">
                <div className="card-hover h-full rounded-2xl border border-transparent bg-surface p-5" style={{ boxShadow: "var(--shadow-soft)" }}>
                  <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                  </span>
                  <h3 className="mb-1.5 text-[16px] font-semibold text-ink">{title}</h3>
                  <p className="text-[14px] leading-relaxed text-ink-secondary">{body}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
