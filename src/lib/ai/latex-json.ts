/**
 * Models often write LaTeX inside JSON strings without doubling the
 * backslashes: `"\,\text{kg}"` is invalid JSON (so the whole lesson was
 * rejected), and `"\frac"`, `"\text"`, `"\nu"` are silently read as a
 * form feed, tab or newline followed by letters. This doubles every
 * backslash that starts a LaTeX command or isn't a valid JSON escape, so
 * both kinds survive parsing as the LaTeX the model meant.
 */

// LaTeX commands whose first letter is also a JSON escape (b, f, n, r, t).
const LATEX_ESCAPE_LOOKALIKES = new Set([
  "bar", "beta", "because", "begin", "big", "bigl", "bigr", "bigg", "binom", "bf", "bm", "boldsymbol", "bot", "bmod", "bullet", "boxed",
  "frac", "forall", "flat", "frown",
  "nabla", "ne", "neg", "neq", "newline", "ngeq", "nleq", "not", "notin", "nmid", "nu", "nexists",
  "rangle", "rbrace", "rceil", "rfloor", "rho", "right", "rightarrow", "rightleftharpoons", "rm", "rvert", "rVert",
  "tan", "tanh", "tau", "text", "textbf", "textit", "textrm", "textdegree", "textstyle", "tfrac", "therefore", "theta", "tilde", "times", "to", "top", "triangle",
])

export function escapeLatexBackslashes(raw: string): string {
  let out = ""
  let i = 0
  while (i < raw.length) {
    const ch = raw[i]
    if (ch !== "\\") {
      out += ch
      i += 1
      continue
    }
    const next = raw[i + 1] ?? ""
    if (next === "\\" || next === "\"" || next === "/") {
      out += ch + next
      i += 2
      continue
    }
    if (next === "u" && /^[0-9a-fA-F]{4}$/.test(raw.slice(i + 2, i + 6))) {
      out += raw.slice(i, i + 6)
      i += 6
      continue
    }
    if ("bfnrt".includes(next) && next !== "") {
      const word = /^[A-Za-z]+/.exec(raw.slice(i + 1))?.[0] ?? next
      // A real escape followed by ordinary text ("\nNow"), unless the whole word is a LaTeX command.
      if (!LATEX_ESCAPE_LOOKALIKES.has(word)) {
        out += ch + next
        i += 2
        continue
      }
    }
    // A LaTeX command (or any other invalid escape): keep the backslash as a literal one.
    out += "\\\\"
    i += 1
  }
  return out
}
