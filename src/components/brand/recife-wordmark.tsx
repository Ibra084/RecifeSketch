import Link from "next/link"

interface RecifeWordmarkProps {
  className?: string
  href?: string
  /** Appends the product name ("sketch") after the Recife wordmark. */
  showProduct?: boolean
  /** "md" matches the landing-page logo size in RecifeAI/src/components/RecifeLogo.tsx. */
  size?: "sm" | "md"
}

const SIZES = {
  sm: { icon: "h-7 w-7 rounded-lg", text: "text-[17px]", stroke: 1.7 },
  md: { icon: "h-8 w-8 rounded-xl", text: "text-xl", stroke: 1.8 },
}

export function RecifeWordmark({ className, href = "/", showProduct = false, size = "sm" }: RecifeWordmarkProps) {
  const s = SIZES[size]
  return (
    <Link
      href={href}
      className={`flex select-none items-center gap-2 ${className ?? ""}`}
    >
      <span className={`flex shrink-0 items-center justify-center bg-gradient-to-br from-blue-500 to-blue-600 ${s.icon}`}>
        <svg width="60%" height="60%" viewBox="0 0 16 16" fill="none">
          <line x1="2" y1="4.5" x2="14" y2="4.5" stroke="white" strokeWidth={s.stroke} strokeLinecap="round" />
          <line x1="2" y1="8" x2="11" y2="8" stroke="white" strokeWidth={s.stroke} strokeLinecap="round" />
          <line x1="2" y1="11.5" x2="8" y2="11.5" stroke="white" strokeWidth={s.stroke} strokeLinecap="round" />
        </svg>
      </span>
      <span className={`${s.text} font-bold leading-none tracking-tight text-ink`}>
        recife
        {showProduct && <span className="ml-1 font-semibold text-ink-muted">sketch</span>}
      </span>
    </Link>
  )
}
