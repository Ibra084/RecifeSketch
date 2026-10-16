"use client"

/**
 * A whiteboard shape that typesets LaTeX (via KaTeX) - how the tutor writes
 * equations and any line of working that contains maths. tldraw's own text
 * shape can't show fractions, roots or real sub/superscripts.
 *
 * All of the tutor's writing uses it, so every line has the same solid
 * backing and stays readable on top of other content. The shape stores its
 * source text, so the AI can read it back and edit it like any other
 * object. `mode: "latex"` is a single expression; `"mixed"` is prose,
 * optionally with `$...$` maths inside it.
 */

import { useLayoutEffect, useRef, type CSSProperties } from "react"
import {
  DefaultColorStyle,
  DefaultSizeStyle,
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  T,
  getColorValue,
  useColorMode,
  type Editor,
  type RecordProps,
  type TLDefaultColorStyle,
  type TLShape,
} from "tldraw"
import { renderLatex, renderMixed, repairJsonEscapes, stripMathDelimiters } from "./math-render"

export const MATH_SHAPE_TYPE = "recife-math"

type MathMode = "latex" | "mixed"
type MathSize = "s" | "m" | "l" | "xl"

declare module "tldraw" {
  interface TLGlobalShapePropsMap {
    [MATH_SHAPE_TYPE]: {
      text: string
      mode: MathMode
      color: TLDefaultColorStyle
      size: MathSize
      /** Wrap width for mixed prose; 0 = one line. */
      maxW: number
      w: number
      h: number
    }
  }
}

export type MathShape = Extract<TLShape, { type: typeof MATH_SHAPE_TYPE }>

// Same multipliers tldraw uses for its text sizes, so maths matches nearby text.
const SIZE_MULTIPLIER: Record<MathSize, number> = { s: 1.125, m: 1.5, l: 2.25, xl: 2.75 }
const PADDING = 4

export function mathFontSize(editor: Editor, size: MathSize): number {
  return editor.getCurrentTheme().fontSize * SIZE_MULTIPLIER[size]
}

export function mathHtml(text: string, mode: MathMode): string {
  // \displaystyle keeps fractions full-size, as a textbook prints a worked line.
  return mode === "latex" ? renderLatex(`\\displaystyle ${stripMathDelimiters(repairJsonEscapes(text))}`) : renderMixed(text)
}

function contentStyle(fontSize: number, maxW: number): Partial<CSSStyleDeclaration> {
  return {
    fontSize: `${fontSize}px`,
    lineHeight: "1.45",
    fontFamily: "var(--tl-font-sans, Inter, system-ui, sans-serif)",
    whiteSpace: maxW > 0 ? "normal" : "nowrap",
    // Wraps at maxW, shrinks to fit shorter text, and never cuts a word narrower than itself. Sized
    // from the content alone (max-content), never from the container: a container that is briefly
    // narrow on first render would otherwise shrink the text to one word per line, and the size
    // sync below would then save that narrow width for good.
    width: "max-content",
    maxWidth: maxW > 0 ? `${maxW}px` : "none",
    minWidth: "min-content",
    padding: `${PADDING}px`,
    boxSizing: "border-box",
  }
}

/**
 * Lays the content out off-screen and returns its size, so the shape has
 * real bounds the moment it's created (for collision checks and comment
 * placement). Without a DOM (unit tests) it falls back to an estimate.
 */
export function measureMath(editor: Editor, text: string, mode: MathMode, size: MathSize, maxW: number): { w: number; h: number } {
  const fontSize = mathFontSize(editor, size)
  if (typeof document === "undefined") {
    return { w: maxW || Math.max(20, text.length * fontSize * 0.55), h: fontSize * 1.6 }
  }
  const probe = document.createElement("div")
  Object.assign(probe.style, contentStyle(fontSize, maxW), { position: "absolute", left: "-10000px", top: "0", visibility: "hidden" })
  probe.innerHTML = mathHtml(text, mode)
  document.body.appendChild(probe)
  const rect = probe.getBoundingClientRect()
  probe.remove()
  return { w: Math.ceil(rect.width), h: Math.ceil(rect.height) }
}

export class MathShapeUtil extends ShapeUtil<MathShape> {
  static override type = MATH_SHAPE_TYPE
  static override props: RecordProps<MathShape> = {
    text: T.string,
    mode: T.literalEnum("latex", "mixed"),
    color: DefaultColorStyle,
    size: DefaultSizeStyle,
    maxW: T.number,
    w: T.number,
    h: T.number,
  }

  getDefaultProps(): MathShape["props"] {
    return { text: "", mode: "latex", color: "black", size: "m", maxW: 0, w: 40, h: 36 }
  }

  override canEdit() { return false }
  override canResize() { return false }

  getGeometry(shape: MathShape) {
    return new Rectangle2d({ width: Math.max(1, shape.props.w), height: Math.max(1, shape.props.h), isFilled: true })
  }

  component(shape: MathShape) {
    return <MathContent shape={shape} editor={this.editor} />
  }

  getIndicatorPath(shape: MathShape) {
    const path = new Path2D()
    path.rect(0, 0, shape.props.w, shape.props.h)
    return { path }
  }
}

function MathContent({ shape, editor }: { shape: MathShape; editor: Editor }) {
  const ref = useRef<HTMLDivElement>(null)
  const colorMode = useColorMode()
  const { text, mode, size, maxW, w, h } = shape.props
  const fontSize = mathFontSize(editor, size)
  const colors = editor.getCurrentTheme().colors[colorMode]
  const color = getColorValue(colors, shape.props.color, "solid")

  // Webfonts can finish loading after the shape was measured: keep its bounds true to what's on screen.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const sync = () => {
      const nw = Math.ceil(el.offsetWidth)
      const nh = Math.ceil(el.offsetHeight)
      if (nw > 0 && nh > 0 && (Math.abs(nw - w) > 1 || Math.abs(nh - h) > 1)) {
        editor.run(() => editor.updateShape<MathShape>({ id: shape.id, type: MATH_SHAPE_TYPE, props: { w: nw, h: nh } }), { history: "ignore" })
      }
    }
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(el)
    return () => observer.disconnect()
  }, [editor, shape.id, w, h])

  // A solid backing (white on a light board) keeps the writing readable when it sits over a line, image or other text.
  const style = { ...contentStyle(fontSize, maxW), background: colors.solid, borderRadius: 4 } as CSSProperties
  return (
    <HTMLContainer style={{ pointerEvents: "all", color }}>
      <div ref={ref} style={style} dangerouslySetInnerHTML={{ __html: mathHtml(text, mode) }} />
    </HTMLContainer>
  )
}
