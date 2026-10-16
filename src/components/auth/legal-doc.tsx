import Link from "next/link"
import type { ReactNode } from "react"
import { ArrowLeft } from "lucide-react"

export function LegalDoc({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article>
      <Link
        href="/sign-in"
        className="-ml-1 mb-4 inline-flex items-center gap-1.5 rounded-full px-1 py-1 text-[13px] font-medium text-gray-400 transition-colors duration-150 hover:text-gray-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        Back
      </Link>
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-gray-900">{title}</h1>
      <p className="mb-5 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
        Draft: to be reviewed by the school and a legal advisor before Recife Sketch is offered to students.
      </p>
      <div className="space-y-3 text-[15px] leading-relaxed text-gray-600 [&_h2]:pt-2 [&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:text-gray-900 [&_li]:mt-1 [&_strong]:text-gray-800 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </article>
  )
}
