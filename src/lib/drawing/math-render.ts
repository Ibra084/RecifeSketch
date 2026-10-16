/**
 * LaTeX rendering for the board and the orb's speech, via KaTeX.
 *
 * KaTeX is a typesetter, not an interpreter: it turns LaTeX markup into
 * HTML and never runs model output as code. `trust: false` disables the
 * commands that could emit links, classes or raw HTML, and the expansion
 * and size limits stop a pathological macro from hanging the page. Plain
 * text around the maths is HTML-escaped before it reaches the DOM.
 */

import katex from "katex"
import { toDisplayMath } from "./math-notation"

const KATEX_OPTIONS = {
  throwOnError: false,
  trust: false,
  strict: "ignore",
  output: "html",
  maxExpand: 500,
  maxSize: 20,
} as const

/** Removes delimiters a model may wrap a whole expression in: `$...$`, `$$...$$`, `\(...\)`, `\[...\]`. */
export function stripMathDelimiters(latex: string): string {
  const trimmed = latex.trim()
  for (const [open, close] of [["$$", "$$"], ["$", "$"], ["\\(", "\\)"], ["\\[", "\\]"]] as const) {
    if (trimmed.length > open.length + close.length && trimmed.startsWith(open) && trimmed.endsWith(close)) {
      return trimmed.slice(open.length, trimmed.length - close.length).trim()
    }
  }
  return trimmed
}

/**
 * A model writing `"\frac"` in JSON (one backslash) gets a form feed + "rac"
 * once parsed - likewise `\t`imes/`\t`ext, `\n`eq, `\r`ho, `\b`eta. Inside
 * LaTeX a control character followed by letters can only be that mistake,
 * so turn it back into the command it was meant to be.
 */
export function repairJsonEscapes(latex: string): string {
  const LOST: Record<string, string> = { "\b": "\\b", "\t": "\\t", "\n": "\\n", "\f": "\\f", "\r": "\\r" }
  return latex.replace(/[\b\t\n\f\r](?=[a-zA-Z])/g, (ch) => LOST[ch])
}

/** One LaTeX expression as HTML. Malformed input renders as red source text rather than throwing. */
export function renderLatex(latex: string, displayMode = false): string {
  // Repair before stripping: trim() would otherwise eat a leading form feed that was "\f"rac.
  return katex.renderToString(stripMathDelimiters(repairJsonEscapes(latex)), { ...KATEX_OPTIONS, displayMode })
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!)
}

// $$display$$, \[display\], $inline$, \(inline\). A `$` needs a closing `$` on the same text to count.
const MATH_SEGMENT = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)/g

export function hasInlineMath(text: string): boolean {
  // A fresh, non-global copy: .test() on the shared /g regex would leave lastIndex set for the next matchAll.
  return new RegExp(MATH_SEGMENT.source).test(text)
}

/**
 * Prose with embedded maths ("so $a = \frac{F}{m}$") as HTML. Text outside
 * the delimiters is escaped; text without any maths still gets the Unicode
 * clean-up (`x^2` -> `x²`) so a model that forgot the delimiters reads fine.
 */
export function renderMixed(text: string): string {
  if (!hasInlineMath(text) && looksLikeBareLatex(text)) return renderLatex(bareLatexToMath(text))
  let html = ""
  let last = 0
  for (const match of text.matchAll(MATH_SEGMENT)) {
    html += plain(text.slice(last, match.index))
    const [, display, bracket, inline, paren] = match
    html += renderLatex((display ?? bracket ?? inline ?? paren)!, display !== undefined || bracket !== undefined)
    last = match.index + match[0].length
  }
  return html + plain(text.slice(last))
}

/** LaTeX written without its `$` delimiters, e.g. a label "F_{\text{pull}} = 8.8\,\text{N}". */
export function looksLikeBareLatex(text: string): boolean {
  return /\\[a-zA-Z]+|[_^]\{/.test(repairJsonEscapes(text))
}

// A plain word (two or more letters, optional trailing punctuation) - prose, not a maths symbol.
const PLAIN_WORD = /^[A-Za-z]{2,}[,.;:!?]?$/

/**
 * Turns bare LaTeX into one maths expression, keeping runs of ordinary
 * words as upright text with their spaces ("Pull force F_{\text{p}}" ->
 * "\text{Pull force }F_{\text{p}}"), since maths mode would otherwise
 * italicise them and drop the spaces.
 */
export function bareLatexToMath(text: string): string {
  // Group consecutive plain words; everything else is a maths token (spaces between those don't matter in maths mode).
  const parts: { words: boolean; text: string }[] = []
  for (const token of repairJsonEscapes(text).trim().split(/\s+/)) {
    const words = PLAIN_WORD.test(token)
    const last = parts.at(-1)
    if (words && last?.words) last.text += ` ${token}`
    else parts.push({ words, text: token })
  }
  // "\ " is an explicit space, so a word run stays separated from the maths either side of it.
  return parts.map((part) => (part.words ? `\\ \\text{${part.text}}\\ ` : part.text)).join(" ").replace(/^\\ /, "").replace(/\\ $/, "").trim()
}

/** Prose: escaped first, then `**bold**` (e.g. a "**Part (a)**" heading) and line breaks are the only markup added. */
function plain(text: string): string {
  return escapeHtml(toDisplayMath(text))
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>")
}

/** Text with the LaTeX markup removed, for the AI's board summary and tooltips: "$\frac{a}{b}$" -> "\frac{a}{b}". */
export function mathSourceSummary(text: string): string {
  return text.replace(MATH_SEGMENT, (_, a?: string, b?: string, c?: string, d?: string) => (a ?? b ?? c ?? d)!)
}
