"use client"

import { useEffect, useRef, useState } from "react"
import { transformerFixture } from "./transformer-fixture"
import { Tldraw, type Editor } from "tldraw"
import "tldraw/tldraw.css"
import { MathShapeUtil } from "@/lib/drawing/math-shape"
import { GraphShapeUtil } from "@/lib/drawing/graph-shape"

// Module-level so tldraw sees a stable array across renders.
const shapeUtils = [MathShapeUtil, GraphShapeUtil]
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { DrawingEngine, type DrawingRunResult } from "@/lib/drawing/engine"
import { drawingProgramSchema } from "@/lib/drawing/protocol"
import { TldrawDrawingAdapter } from "@/lib/drawing/tldraw-adapter"
import { buildRendererDemoSequence } from "@/lib/drawing/playback/demo-sequence"
import { DrawingPlayer } from "@/lib/drawing/playback/player"
import { TldrawShapeAnimator } from "@/lib/drawing/playback/tldraw-animator"
import type { PlaybackSnapshot } from "@/lib/drawing/playback/types"

/**
 * Developer-only harness: lets you type or paste a raw drawing program
 * (the same JSON an AI tool call will eventually send) and run it against
 * a live tldraw board, without any AI model in the loop. One engine
 * persists for the lifetime of the page, so object ids created by one
 * run stay addressable in the next - exactly like a real multi-turn
 * session would.
 */

const PRESETS: Record<string, unknown> = {
  "Transformer layout regression": transformerFixture(),
  "Rectangle + label": [
    {
      type: "create_shape",
      id: "demo-rect",
      shape: "rectangle",
      x: 100,
      y: 100,
      w: 160,
      h: 100,
      color: "blue",
      label: "Hello",
    },
  ],
  "Two shapes + arrow": [
    { type: "create_shape", id: "demo-a", shape: "ellipse", x: 0, y: 300, w: 80, h: 80, color: "green" },
    { type: "create_shape", id: "demo-b", shape: "ellipse", x: 300, y: 300, w: 80, h: 80, color: "red" },
    {
      type: "draw_arrow",
      id: "demo-arrow",
      start: { x: 80, y: 340 },
      end: { x: 300, y: 340 },
      label: "causes",
    },
  ],
  "Plot sin(x)": [
    {
      type: "plot_function",
      id: "demo-plot",
      expression: "sin(x)",
      domain: [-6.28, 6.28],
      position: { x: 500, y: 500 },
      scale: { x: 30, y: 40 },
    },
  ],
  "Polygon + freehand pen": [
    {
      type: "create_polygon",
      id: "demo-poly",
      points: [
        { x: 0, y: 600 },
        { x: 80, y: 600 },
        { x: 40, y: 520 },
      ],
      color: "violet",
      fill: "solid",
    },
    {
      type: "create_freehand_path",
      id: "demo-pen",
      points: [
        { x: 150, y: 600 },
        { x: 170, y: 560 },
        { x: 200, y: 620 },
        { x: 230, y: 540 },
      ],
      color: "orange",
    },
  ],
  "Move + highlight + clear_region": [
    { type: "create_shape", id: "demo-target", shape: "rectangle", x: 0, y: 800, w: 100, h: 60 },
    { type: "move_object", id: "demo-target", position: { x: 40, y: 820 } },
    { type: "highlight_object", id: "demo-target", color: "yellow" },
    { type: "clear_region", region: { x: -50, y: 750, w: 300, h: 200 } },
  ],
  "Invalid action (for error handling)": [
    { type: "create_shape", id: "bad", shape: "not-a-real-shape", x: 0, y: 0, w: 10, h: 10 },
  ],
}

const SPEED_OPTIONS = [0.5, 1, 2, 4] as const

export function DrawingHarness() {
  const adapterRef = useRef<TldrawDrawingAdapter | null>(null)
  useEffect(() => () => adapterRef.current?.dispose(), [])
  const editorRef = useRef<Editor | null>(null)
  const engineRef = useRef<DrawingEngine | null>(null)
  const animatorRef = useRef<TldrawShapeAnimator | null>(null)
  const playerRef = useRef<DrawingPlayer | null>(null)
  const [input, setInput] = useState(JSON.stringify(PRESETS["Rectangle + label"], null, 2))
  const [result, setResult] = useState<DrawingRunResult | { stage: "parse-error"; message: string } | null>(
    null
  )
  const [speed, setSpeed] = useState<number>(1)
  const [snapshot, setSnapshot] = useState<PlaybackSnapshot | null>(null)

  function handleMount(editor: Editor) {
    editorRef.current = editor
    // Dev harness only: lets a developer inspect the board from the browser console.
    ;(window as unknown as { harnessEditor?: Editor }).harnessEditor = editor
    adapterRef.current?.dispose()
    adapterRef.current = new TldrawDrawingAdapter(editor)
    engineRef.current = new DrawingEngine(adapterRef.current)
    animatorRef.current = new TldrawShapeAnimator(editor)
  }

  function playDemo() {
    const engine = engineRef.current
    const animator = animatorRef.current
    if (!engine || !animator) return

    const player = new DrawingPlayer({ engine, animator, speed })
    playerRef.current = player
    player.subscribe(setSnapshot)
    setSnapshot(player.getSnapshot())
    void player.play(buildRendererDemoSequence())
  }

  function handleSpeedChange(next: number) {
    setSpeed(next)
    playerRef.current?.setSpeed(next)
  }

  function run() {
    let raw: unknown
    try {
      raw = JSON.parse(input)
    } catch (error) {
      setResult({ stage: "parse-error", message: error instanceof Error ? error.message : String(error) })
      return
    }

    const parsed = drawingProgramSchema.safeParse(raw)
    if (!parsed.success) {
      setResult({
        stage: "validation",
        ok: false,
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      })
      return
    }

    const engine = engineRef.current
    if (!engine) return
    setResult(engine.run(parsed.data))
  }

  function clearBoard() {
    const editor = editorRef.current
    if (!editor) return
    playerRef.current?.cancel()
    editor.deleteShapes(Array.from(editor.getCurrentPageShapeIds()))
    adapterRef.current?.dispose()
    adapterRef.current = new TldrawDrawingAdapter(editor)
    engineRef.current = new DrawingEngine(adapterRef.current)
    playerRef.current = null
    setResult(null)
    setSnapshot(null)
  }

  return (
    <div className="flex h-dvh w-full">
      <div className="relative flex-1">
        <Tldraw
          persistenceKey="recife-sketch-drawing-harness"
          shapeUtils={shapeUtils}
          onMount={handleMount}
          licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
        />
      </div>

      <div className="flex w-[420px] shrink-0 flex-col border-l border-border-subtle bg-surface">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border-subtle px-4">
          <span className="text-[13px] font-semibold text-ink">Drawing engine harness</span>
          <Button variant="ghost" size="sm" onClick={clearBoard}>
            Reset
          </Button>
        </div>

        <div className="flex flex-col gap-2 border-b border-border-subtle p-3">
          <span className="text-[12px] font-semibold text-ink-secondary">
            Progressive renderer demo (not educational content)
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" onClick={playDemo}>
              Play demo sequence
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!snapshot || (snapshot.state !== "drawing" && snapshot.state !== "paused")}
              onClick={() => {
                const player = playerRef.current
                if (!player) return
                if (player.getSnapshot().state === "paused") player.resume()
                else player.pause()
              }}
            >
              {snapshot?.state === "paused" ? "Resume" : "Pause"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!snapshot || (snapshot.state !== "drawing" && snapshot.state !== "paused")}
              onClick={() => playerRef.current?.cancel()}
            >
              Cancel
            </Button>
            <div className="flex items-center gap-1">
              {SPEED_OPTIONS.map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={speed === option ? "default" : "ghost"}
                  onClick={() => handleSpeedChange(option)}
                >
                  {option}x
                </Button>
              ))}
            </div>
          </div>

          {snapshot && (
            <div className="rounded-lg border border-border-subtle bg-surface-subtle p-2.5 text-[11px] leading-relaxed text-ink-secondary">
              <div>
                state: <span className="font-semibold text-ink">{snapshot.state}</span>
              </div>
              <div>
                step {snapshot.stepIndex + 1}/{snapshot.totalSteps} · action {snapshot.actionIndex}/
                {snapshot.totalActions}
              </div>
              {snapshot.error && (
                <div className="mt-1 text-red-700">
                  error on {snapshot.error.action.type}: {snapshot.error.message}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-border-subtle p-3">
          {Object.keys(PRESETS).map((name) => (
            <Button
              key={name}
              variant="outline"
              size="sm"
              onClick={() => setInput(JSON.stringify(PRESETS[name], null, 2))}
            >
              {name}
            </Button>
          ))}
        </div>

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            className="min-h-[220px] flex-1 font-mono text-[12px]"
            spellCheck={false}
          />
          <Button onClick={run}>Run program</Button>

          {result && (
            <pre
              className={`whitespace-pre-wrap rounded-lg border p-3 text-[11px] leading-relaxed ${
                "ok" in result && result.ok
                  ? "border-green-200 bg-green-50 text-green-900"
                  : "border-red-200 bg-red-50 text-red-900"
              }`}
            >
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
