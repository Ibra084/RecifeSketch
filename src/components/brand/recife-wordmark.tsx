import Link from "next/link"

interface RecifeWordmarkProps {
  className?: string
}

export function RecifeWordmark({ className }: RecifeWordmarkProps) {
  return (
    <Link
      href="/"
      className={`flex select-none items-center gap-2 ${className ?? ""}`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
        <svg width="60%" height="60%" viewBox="0 0 16 16" fill="none">
          <line x1="2" y1="4.5" x2="14" y2="4.5" stroke="white" strokeWidth={1.7} strokeLinecap="round" />
          <line x1="2" y1="8" x2="11" y2="8" stroke="white" strokeWidth={1.7} strokeLinecap="round" />
          <line x1="2" y1="11.5" x2="8" y2="11.5" stroke="white" strokeWidth={1.7} strokeLinecap="round" />
        </svg>
      </span>
      <span className="text-[17px] font-bold leading-none tracking-tight text-ink">
        recife
      </span>
    </Link>
  )
}
