/** Characters after which a | must be an opening bar: "(|x|", "2+|x|", "y=|x|", "^|x|"... */
const OPENS_AFTER = new Set(["(", "[", "{", "+", "-", "*", "/", "^", "=", ",", "<", ">", "\u0001"])

/**
 * Absolute-value bars, |...|, as written by people (and models), turned into
 * an explicit open/close pair. A bar opens when nothing usable comes before
 * it (start, an operator, an opening bracket or another opening bar) and
 * otherwise closes the innermost open bar - so "||x|-1|" and "2|x-1|+|x|"
 * both pair up as intended. Unbalanced bars throw, so a mistake can't plot
 * something different from what was meant. `\u0001` in the input stands for
 * an opening bar that was already explicit (e.g. LaTeX's \left|).
 */
export function convertAbsBars(text: string, open: string, close: string): string {
  let out = ""
  let depth = 0
  let previous = "" // last non-space character before this point
  let previousWasOpenBar = false
  for (const ch of text) {
    if (ch !== "|") {
      out += ch
      if (ch.trim()) {
        previous = ch
        previousWasOpenBar = false
      }
      continue
    }
    if (depth === 0 || previous === "" || previousWasOpenBar || OPENS_AFTER.has(previous)) {
      out += open
      depth++
      previousWasOpenBar = true
    } else {
      out += close
      depth--
      previousWasOpenBar = false
    }
    previous = "|"
  }
  if (depth !== 0) throw new Error("Unbalanced | bars in expression")
  return out
}
