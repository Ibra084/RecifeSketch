"use client"

import { useEffect, useState, type CSSProperties } from "react"
import { ChevronLeft, ChevronRight, MessageCircle, PenLine, Sparkles } from "lucide-react"

/**
 * Landing-page demo of a Recife Sketch lesson. Structure (framed floating
 * card, auto-advancing steps, sweeping progress bars, pause on hover) is
 * RecifeAI/src/components/ProductPreview.tsx; the scene re-creates the real
 * whiteboard: the student's writing and selection, the companion orb (same
 * gradient, icons and state rings as components/companion/ai-companion.tsx),
 * its step-by-step speech bubble, blue AI annotations and an exact plot.
 *
 * Entirely deterministic SVG/CSS: no model calls, no student data.
 */

const STEP_MS = 4200

const STEPS = [
  { label: "You work on the board", summary: "A student writes 2x + 3 = 11 on the whiteboard." },
  { label: "Recife comes to your work", summary: "The student selects their working and Recife's orb glides over to it." },
  { label: "Explains it step by step", summary: "Recife annotates the working in blue and explains the first step in a floating comment." },
  { label: "Graphs, plotted exactly", summary: "Recife plots y = 2x + 3 and y = 11, meeting exactly at x = 4." },
]

type OrbState = "idle" | "thinking" | "speaking" | "drawing"
const ORB: Record<number, { x: number; y: number; state: OrbState }> = {
  0: { x: 584, y: 334, state: "idle" },
  1: { x: 344, y: 104, state: "thinking" },
  2: { x: 344, y: 104, state: "speaking" },
  3: { x: 348, y: 300, state: "drawing" },
}

const SPEECH = {
  step: "Step 1 of 2",
  text: "Subtract 3 from both sides, so only the 2x term is left: 2x = 8.",
}

// Graph geometry: x ∈ [0, 6] → 392..608 px, y ∈ [0, 15] → 352..202 px.
const gx = (x: number) => 392 + x * 36
const gy = (y: number) => 352 - y * 10
const line = (f: (x: number) => number) => `M${gx(0)} ${gy(f(0))} L${gx(6)} ${gy(f(6))}`
const SOLUTION = (11 - 3) / 2 // where 2x + 3 meets 11

const HAND = "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive"
const MATH = "KaTeX_Main, 'Times New Roman', serif"

const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` })
const stroke = (len: number, ms = 0): CSSProperties => ({ ...delay(ms), ["--len" as string]: len })

function Orb({ step }: { step: number }) {
  const { x, y, state } = ORB[step]
  const Icon = state === "drawing" ? PenLine : state === "speaking" ? MessageCircle : Sparkles
  return (
    <g style={{ transform: `translate(${x}px, ${y}px)`, transition: "transform 700ms var(--ease-premium)" }}>
      {state === "speaking" && <circle r={27} fill="none" stroke="rgba(147,197,253,0.6)" strokeWidth={4} />}
      {state === "drawing" && (
        <circle r={24} fill="rgba(96,165,250,0.3)" className="motion-safe:animate-ping" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
      )}
      <circle r={24} fill="url(#demo-orb)" filter="url(#demo-orb-shadow)" />
      {state === "thinking" ? (
        [-8, 0, 8].map((dx, i) => (
          <circle
            key={dx}
            cx={dx}
            r={2.6}
            fill="white"
            className="motion-safe:animate-bounce"
            style={{ ...delay(i * 150), transformBox: "fill-box" }}
          />
        ))
      ) : (
        <Icon x={-11} y={-11} width={22} height={22} color="white" aria-hidden />
      )}
    </g>
  )
}

function SpeechCard({ className = "" }: { className?: string }) {
  // Same treatment as the real SpeechBubble in ai-companion.tsx.
  return (
    <div
      className={`rounded-2xl border border-border-subtle bg-surface px-3.5 pb-2.5 pt-2.5 ${className}`}
      style={{ boxShadow: "var(--shadow-popover)" }}
    >
      <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent-foreground">{SPEECH.step}</p>
      <p className="text-[13px] leading-relaxed text-ink">{SPEECH.text}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="invisible flex h-7 items-center gap-0.5 px-2 text-[12px] font-medium text-ink-secondary">
          <ChevronLeft className="h-3.5 w-3.5" /> Back
        </span>
        <span className="flex h-7 items-center gap-0.5 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground">
          Next <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  )
}

function Board({ step }: { step: number }) {
  return (
    <svg viewBox="0 0 640 380" className="block h-auto w-full" role="img" aria-label={STEPS[step].summary}>
      <defs>
        <linearGradient id="demo-orb" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
        <filter id="demo-orb-shadow" x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#2563eb" floodOpacity="0.35" />
        </filter>
        <pattern id="demo-dots" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="10" cy="10" r="1" fill="rgba(24,24,27,0.09)" />
        </pattern>
        <marker id="demo-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M1 1 L8 5 L1 9" fill="none" stroke="#2563eb" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>

      <rect width="640" height="380" fill="#fafafa" />
      <rect width="640" height="380" fill="url(#demo-dots)" />

      {/* Student's work (always on the board; it persists across steps). */}
      <g fill="#27272a" fontFamily={HAND}>
        <text x="60" y="114" fontSize="32" className={step === 0 ? "demo-write" : undefined}>
          2x + 3 = 11
        </text>
        <text x="272" y="114" fontSize="30" fill="#71717a" transform="rotate(8 280 104)" className={step === 0 ? "demo-write" : undefined} style={delay(700)}>
          ?
        </text>
      </g>
      <path
        d="M58 128 q 70 7 196 -1"
        fill="none"
        stroke="#3f3f46"
        strokeWidth="2.2"
        strokeLinecap="round"
        className={step === 0 ? "demo-stroke" : undefined}
        style={stroke(210, 900)}
      />

      {/* tldraw-style selection around the student's working. */}
      {step >= 1 && (
        <g className={step === 1 ? "demo-fade" : undefined}>
          <rect x="46" y="74" width="262" height="66" rx="2" fill="rgba(37,99,235,0.04)" stroke="#2563eb" strokeWidth="1.5" />
          {[
            [46, 74],
            [308, 74],
            [46, 140],
            [308, 140],
          ].map(([cx, cy]) => (
            <rect key={`${cx}-${cy}`} x={cx - 4} y={cy - 4} width="8" height="8" rx="1.5" fill="white" stroke="#2563eb" strokeWidth="1.5" />
          ))}
        </g>
      )}

      {/* AI annotations: drawn in blue, editable shapes in the real app. */}
      {step >= 2 && (
        <g>
          {/* Markers ignore the dash animation, so each arrow fades in as its stroke starts. */}
          <g className="demo-fade" style={delay(200)}>
            <path d="M86 146 C 70 162 70 178 84 194" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" markerEnd="url(#demo-arrow)" className="demo-stroke" style={stroke(60, 200)} />
          </g>
          <text x="104" y="176" fontSize="14" fontWeight="500" fill="#2563eb" fontFamily="var(--font-inter), system-ui, sans-serif" className="demo-fade" style={delay(450)}>
            − 3 from both sides
          </text>
          <text x="60" y="226" fontSize="28" fill="#1d4ed8" fontFamily={MATH} className="demo-write" style={delay(700)}>
            2<tspan fontStyle="italic">x</tspan> = 8
          </text>
          <g className="demo-fade" style={delay(1150)}>
            <path d="M86 236 C 70 250 70 262 84 274" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" markerEnd="url(#demo-arrow)" className="demo-stroke" style={stroke(50, 1150)} />
          </g>
          <text x="104" y="262" fontSize="14" fontWeight="500" fill="#2563eb" fontFamily="var(--font-inter), system-ui, sans-serif" className="demo-fade" style={delay(1350)}>
            ÷ 2
          </text>
          <text x="66" y="306" fontSize="28" fill="#1d4ed8" fontFamily={MATH} className="demo-write" style={delay(1550)}>
            <tspan fontStyle="italic">x</tspan> = 4
          </text>
          <rect x="52" y="278" width="96" height="40" rx="12" fill="none" stroke="#2563eb" strokeWidth="2" className="demo-stroke" style={stroke(280, 1950)} />
        </g>
      )}

      {/* The floating explanation comment (step 2 only; "Done" closes it). */}
      {step === 2 && (
        <foreignObject x="378" y="40" width="236" height="132" className="hidden sm:block">
          <SpeechCard className="motion-safe:animate-[speech-in_220ms_var(--ease-premium)]" />
        </foreignObject>
      )}

      {/* Exact plot: both lines computed from their equations. */}
      {step >= 3 && (
        <g fontFamily={MATH}>
          <path d={`M${gx(0)} ${gy(0)} H616 M${gx(0)} ${gy(0)} V194`} stroke="#a1a1aa" strokeWidth="1.4" fill="none" className="demo-fade" />
          <text x="622" y={gy(0) + 4} fontSize="14" fill="#71717a" fontStyle="italic" className="demo-fade">x</text>
          <text x={gx(0) - 4} y="188" fontSize="14" fill="#71717a" fontStyle="italic" textAnchor="middle" className="demo-fade">y</text>
          <path d={line((x) => 2 * x + 3)} stroke="#2563eb" strokeWidth="2.4" fill="none" strokeLinecap="round" className="demo-stroke" style={stroke(250, 150)} />
          <path d={line(() => 11)} stroke="#16a34a" strokeWidth="2.4" fill="none" strokeLinecap="round" className="demo-stroke" style={stroke(220, 600)} />
          <path d={`M${gx(SOLUTION)} ${gy(11)} V${gy(0)}`} stroke="#71717a" strokeWidth="1.2" strokeDasharray="4 4" className="demo-fade" style={delay(1100)} />
          <circle cx={gx(SOLUTION)} cy={gy(11)} r="4.5" fill="#1d4ed8" className="demo-fade" style={delay(1100)} />
          <text x="452" y="318" fontSize="15" fill="#1d4ed8" className="demo-fade" style={delay(500)}>
            y = 2<tspan fontStyle="italic">x</tspan> + 3
          </text>
          <text x="400" y={gy(11) - 8} fontSize="15" fill="#15803d" className="demo-fade" style={delay(900)}>
            y = 11
          </text>
          <text x={gx(SOLUTION)} y="372" fontSize="15" fill="#1d4ed8" textAnchor="middle" className="demo-fade" style={delay(1300)}>
            <tspan fontStyle="italic">x</tspan> = 4
          </text>
        </g>
      )}

      <Orb step={step} />
    </svg>
  )
}

export function ProductPreview() {
  const [step, setStep] = useState(0)
  const [paused, setPaused] = useState(false)
  const [cycle, setCycle] = useState(0)
  /** Bumped whenever the lesson restarts from step 0, which redraws the board from blank. */
  const [round, setRound] = useState(0)

  useEffect(() => {
    if (paused) return
    const t = setTimeout(() => {
      const next = (step + 1) % STEPS.length
      if (next === 0) setRound((r) => r + 1)
      setStep(next)
      setCycle((c) => c + 1)
    }, STEP_MS)
    return () => clearTimeout(t)
  }, [step, paused, cycle])

  function selectStep(i: number) {
    if (i === 0) setRound((r) => r + 1)
    setStep(i)
    setCycle((c) => c + 1)
  }

  return (
    <div
      className="animate-float-slow"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        className="rounded-[28px] bg-surface p-2"
        style={{ border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-popover)" }}
      >
        <div className="overflow-hidden rounded-[22px] border border-border-subtle" key={round}>
          <Board step={step} />
        </div>
        {step === 2 && <SpeechCard className="animate-step-in m-2 mt-3 sm:hidden" />}
      </div>

      {/* Step indicator, which is also the timer: each segment sweeps over its dwell time. */}
      <div className="mt-5 flex items-start gap-2">
        {STEPS.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => selectStep(i)}
            className="group flex-1 text-left"
            aria-label={`Show: ${s.label}`}
            aria-pressed={i === step}
          >
            <span className="block h-[3px] overflow-hidden rounded-full bg-surface-sunken">
              <span
                key={i === step ? `${step}-${cycle}` : `idle-${i}`}
                className="block h-full origin-left rounded-full bg-blue-600"
                style={
                  i < step
                    ? { transform: "scaleX(1)" }
                    : i === step
                      ? { animation: `progress-sweep ${STEP_MS}ms linear forwards`, animationPlayState: paused ? "paused" : "running" }
                      : { transform: "scaleX(0)" }
                }
              />
            </span>
            <span
              className={`mt-2.5 block text-[11.5px] font-medium leading-snug transition-colors sm:text-[12px] ${
                i === step ? "text-ink" : "text-ink-faint group-hover:text-ink-muted"
              }`}
            >
              {s.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
