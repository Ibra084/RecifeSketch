"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Box, createShapeId, renderPlaintextFromRichText, useValue, type Editor, type TLShapeId } from "tldraw"
import { RecifeWordmark } from "@/components/brand/recife-wordmark"
import { BoardHeader } from "@/components/whiteboard/board-header"
import type { SavedBoard, SaveStatus } from "@/components/whiteboard/board-persistence"
import { useDeviceFlag } from "@/components/whiteboard/use-device-flag"
import { AiCompanion, type CompanionState, type TutorSpeech } from "@/components/companion/ai-companion"
import { CONTEXT_IMAGE, QUESTION_IMAGE, readImageUrl, readQuestionImageBlob } from "@/components/companion/question-image"
import { useCompanionOrb } from "@/components/companion/use-companion-orb"
import { useTutor, type WhiteboardController } from "@/components/companion/use-tutor"
import { actionFocusRect } from "@/lib/drawing/action-focus-point"
import { focusedStudentWork, isStudentShape } from "@/lib/drawing/authorship"
import { placeLesson, type Obstacle } from "@/lib/drawing/lesson-placement"
import { DrawingEngine } from "@/lib/drawing/engine"
import { DrawingPlayer } from "@/lib/drawing/playback/player"
import { TldrawShapeAnimator } from "@/lib/drawing/playback/tldraw-animator"
import type { DrawingSequence } from "@/lib/drawing/playback/types"
import type { DrawingAction } from "@/lib/drawing/protocol"
import { cameraMoveFor } from "@/lib/overlay/camera-follow"
import { recognizeWords } from "@/lib/ocr/recognize-words"
import { findUnattachedQuestionImage, markQuestionSourceAttached, placeQuestionSheet } from "@/lib/drawing/question-sheet"
import { TldrawDrawingAdapter } from "@/lib/drawing/tldraw-adapter"
import { pageRect, projectRect, type PageRect, type ViewportRect } from "@/lib/overlay/coordinates"
import { prefersReducedMotion } from "@/lib/utils"

// tldraw touches browser-only APIs (IndexedDB, window) during setup, so it
// must never render on the server.
const WhiteboardSection = dynamic(
  () => import("@/components/whiteboard/whiteboard-section").then((mod) => mod.WhiteboardSection),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-surface-subtle text-[13px] text-ink-muted">
        Loading whiteboard…
      </div>
    ),
  }
)

/** Render scale that gives an exported area about `maxSide` pixels on its long side (never absurdly large or small). */
function exportPixelRatio(bounds: { w: number; h: number }, maxSide: number): number {
  return Math.min(4, Math.max(0.25, maxSide / Math.max(1, bounds.w, bounds.h)))
}

/**
 * What a new lesson must not draw over: everything on the board except what
 * the lesson itself deletes. The student's own work, the question and anything
 * selected may be marked directly (an outline, an arrow pointing at it).
 */
function boardObstacles(editor: Editor, sequence: DrawingSequence): Obstacle[] {
  const deleted = new Set(sequence.flatMap((step) => step.actions)
    .flatMap((action) => (action.type === "delete_object" ? [createShapeId(action.id)] : [])))
  const selected = new Set(editor.getSelectedShapeIds())
  return editor.getCurrentPageShapes().flatMap((shape) => {
    if (deleted.has(shape.id)) return []
    const b = editor.getShapePageBounds(shape)
    if (!b || (b.w === 0 && b.h === 0)) return []
    const annotatable = isStudentShape(shape) || Boolean(shape.meta.recifeQuestionSource) || selected.has(shape.id)
    return [{ x: b.x, y: b.y, w: b.w, h: b.h, annotatable }]
  })
}

/** How long the orb lingers near the last explanation before drifting home. */
const RETURN_HOME_DELAY_MS = 2500
const SPEAKING_PULSE_MS = 1800
const SPEECH_FADE_MS = 300

/**
 * The lesson being explained. The student clicks through it: each step's
 * explanation shows while that step draws, and the next step only starts
 * when they press Next. Back re-reads earlier explanations.
 */
interface Lesson {
  id: number
  steps: { text: string; avoid: ViewportRect | null }[]
  totalSteps: number
  /** Which explanation is showing (Back can move it behind the latest step). */
  view: number
  /** Playback is holding until the student presses Next. */
  waiting: boolean
  /** Playback has ended (completed, stopped or failed). */
  finished: boolean
  /** The speech bubble is showing; Done closes it (the step list stays in the orb panel). */
  open: boolean
  leaving: boolean
}

type FollowHandler = (drawn: DrawingAction, signal: AbortSignal) => Promise<void>

/** How long the camera takes to bring the next drawing into view. */
const FOLLOW_CAMERA_MS = 350

type StepHandler = (sequence: DrawingSequence, stepIndex: number, text: string | undefined) => void

interface AppShellProps {
  /** A saved whiteboard (from the dashboard). Without one, the board persists locally only. */
  board?: SavedBoard & { title: string }
}

export function AppShell({ board }: AppShellProps = {}) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved")
  const [stylePanelHidden, setStylePanelHidden] = useDeviceFlag("recife-sketch-hide-style-panel")
  // The engine and animator live for the whiteboard's whole mounted
  // lifetime (not recreated per question), so object ids stay addressable
  // across turns - a fresh DrawingPlayer is created per `play()` call.
  const engineRef = useRef<DrawingEngine | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const adapterRef = useRef<TldrawDrawingAdapter | null>(null)
  const animatorRef = useRef<TldrawShapeAnimator | null>(null)
  const playerRef = useRef<DrawingPlayer | null>(null)
  const stepHandlerRef = useRef<StepHandler | null>(null)
  const endTurnRef = useRef<(() => void) | null>(null)
  const followDrawnRef = useRef<FollowHandler | null>(null)
  // Mirrors editorRef as state: overlays need the editor to render, and refs can't be read during render.
  const [mountedEditor, setMountedEditor] = useState<Editor | null>(null)

  const viewportW = useValue("viewport w", () => mountedEditor?.getViewportScreenBounds().w ?? 0, [mountedEditor])
  const viewportH = useValue("viewport h", () => mountedEditor?.getViewportScreenBounds().h ?? 0, [mountedEditor])
  const viewport = useMemo(() => (viewportW > 0 ? { w: viewportW, h: viewportH } : null), [viewportW, viewportH])
  // Whatever the student has selected on the board is what their next question is about.
  const selectionCount = useValue("selection count", () => mountedEditor?.getSelectedShapeIds().length ?? 0, [mountedEditor])

  const orb = useCompanionOrb(viewport)
  const [speaking, setSpeaking] = useState(false)
  const speakingTimerRef = useRef<number | undefined>(undefined)
  const homeTimerRef = useRef<number | undefined>(undefined)

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const lessonIdRef = useRef(0)
  /** Releases playback held between steps (set while waiting for Next). */
  const releaseStepRef = useRef<(() => void) | null>(null)
  const closeTimerRef = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(closeTimerRef.current), [])

  const lessonBack = useCallback(() => {
    setLesson((current) => (current && current.view > 0 ? { ...current, view: current.view - 1 } : current))
  }, [])
  const lessonNext = useCallback(() => {
    if (!lesson) return
    if (lesson.view < lesson.steps.length - 1) {
      setLesson({ ...lesson, view: lesson.view + 1 })
    } else if (lesson.waiting) {
      setLesson({ ...lesson, waiting: false })
      releaseStepRef.current?.()
    } else if (lesson.finished) {
      // Done: fade the bubble out; the steps stay listed in the orb's panel.
      setLesson({ ...lesson, leaving: true })
      window.clearTimeout(closeTimerRef.current)
      const id = lesson.id
      closeTimerRef.current = window.setTimeout(
        () => setLesson((current) => (current?.id === id ? { ...current, open: false, leaving: false } : current)),
        SPEECH_FADE_MS
      )
    }
  }, [lesson])

  // Overlays (the orb and its speech) sit above the canvas, so wheel and pinch gestures
  // over them would otherwise reach the browser and zoom the whole page.
  // Hand them to the whiteboard instead, so the board pans/zooms as expected.
  const mainRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const main = mainRef.current
    if (!main || !mountedEditor) return
    const editor = mountedEditor
    const fromCanvas = (event: Event) => event.target instanceof Node && editor.getContainer().contains(event.target)
    function onWheel(event: WheelEvent) {
      if (fromCanvas(event)) return // tldraw's own handler already ran (or chose to let it scroll)
      const target = event.target as Element | null
      // Let text areas (e.g. the question composer) scroll themselves, unless this is a pinch/ctrl zoom.
      if (!event.ctrlKey && !event.metaKey && target?.closest("textarea, [data-scrollable]")) return
      event.preventDefault()
      // tldraw ignores wheel input while unfocused (e.g. after clicking the orb); don't steal DOM focus though.
      if (!editor.getInstanceState().isFocused) editor.focus({ focusContainer: false })
      editor.getContainer().querySelector(".tl-canvas")?.dispatchEvent(
        new WheelEvent("wheel", {
          deltaX: event.deltaX, deltaY: event.deltaY, deltaZ: event.deltaZ, deltaMode: event.deltaMode,
          clientX: event.clientX, clientY: event.clientY, screenX: event.screenX, screenY: event.screenY,
          ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, altKey: event.altKey,
          bubbles: true, cancelable: true,
        })
      )
    }
    // Safari's trackpad pinch uses non-standard gesture events; stop them zooming the page.
    const blockGesture = (event: Event) => { if (!fromCanvas(event)) event.preventDefault() }
    main.addEventListener("wheel", onWheel, { passive: false })
    main.addEventListener("gesturestart", blockGesture)
    main.addEventListener("gesturechange", blockGesture)
    return () => {
      main.removeEventListener("wheel", onWheel)
      main.removeEventListener("gesturestart", blockGesture)
      main.removeEventListener("gesturechange", blockGesture)
    }
  }, [mountedEditor])

  const handleEditorMount = useCallback((editor: Editor) => {
    editorRef.current = editor
    setMountedEditor(editor)
    adapterRef.current?.dispose()
    const adapter = new TldrawDrawingAdapter(editor)
    adapterRef.current = adapter
    engineRef.current = new DrawingEngine(adapter)
    animatorRef.current = new TldrawShapeAnimator(editor)
  }, [])
  useEffect(() => () => adapterRef.current?.dispose(), [])

  /** The board area a step works on: its first action's object, or the area it is about to cover. */
  const resolveStepArea = useCallback((sequence: DrawingSequence, stepIndex: number): PageRect | null => {
    const adapter = adapterRef.current
    for (const action of sequence[stepIndex]?.actions ?? []) {
      const removes = action.type === "delete_object" || action.type === "clear_region"
      const bounds = "id" in action && !removes ? adapter?.getObjectBounds(action.id) : undefined
      if (bounds) return pageRect(bounds.x, bounds.y, bounds.w, bounds.h)
      // At step start the shape usually doesn't exist yet: use the area it is about to cover.
      const rect = actionFocusRect(action)
      if (rect) return pageRect(rect.x, rect.y, Math.max(1, rect.w), Math.max(1, rect.h))
    }
    return null
  }, [])

  // Latest-closure handlers for the (stable) board controller to call into.
  useEffect(() => {
    stepHandlerRef.current = (sequence, stepIndex, text) => {
      const editor = editorRef.current
      if (!editor) return
      // The orb itself follows each object as it's drawn (followDrawn); this only seeds where the speech should avoid.
      const area = resolveStepArea(sequence, stepIndex)
      const areaRect = area ? projectRect(editor, area) : null
      setLesson((current) => current && {
        ...current,
        steps: [...current.steps.slice(0, stepIndex), { text: text ?? "", avoid: areaRect }],
        view: stepIndex,
        waiting: false,
      })
      setSpeaking(true)
      window.clearTimeout(speakingTimerRef.current)
      speakingTimerRef.current = window.setTimeout(() => setSpeaking(false), SPEAKING_PULSE_MS)
    }
    followDrawnRef.current = async (drawn, signal) => {
      const editor = editorRef.current
      const adapter = adapterRef.current
      if (!editor || !adapter || !("id" in drawn) || drawn.type === "delete_object") return
      const bounds = adapter.getObjectBounds(drawn.id)
      if (!bounds) return
      // The screen follows the writing: zoom in if it's too small to read, re-centre if it drifts off-centre.
      const move = cameraMoveFor(editor.getViewportPageBounds(), bounds, 60 / editor.getZoomLevel(), editor.getZoomLevel())
      const duration = prefersReducedMotion() ? 0 : FOLLOW_CAMERA_MS
      if (move.kind === "pan") editor.centerOnPoint(move.center, { animation: { duration } })
      if (move.kind === "fit") editor.zoomToBounds(move.bounds, { targetZoom: 1, animation: { duration } })
      if (move.kind !== "none" && duration > 0) {
        await new Promise<void>((resolve) => {
          const timer = window.setTimeout(resolve, duration + 30)
          signal.addEventListener("abort", () => { window.clearTimeout(timer); resolve() }, { once: true })
        })
      }
      // Then the tutor moves right beside it, and its speech keeps off it.
      const onScreen = projectRect(editor, pageRect(bounds.x, bounds.y, bounds.w, bounds.h))
      orb.glideNear(onScreen, [])
      setLesson((current) => current && current.steps.length > 0 ? {
        ...current,
        steps: current.steps.map((step, i) => (i === current.steps.length - 1 ? { ...step, avoid: onScreen } : step)),
      } : current)
    }
    endTurnRef.current = () => {
      window.clearTimeout(homeTimerRef.current)
      homeTimerRef.current = window.setTimeout(orb.endTurn, RETURN_HOME_DELAY_MS)
      releaseStepRef.current = null
      // The last explanation stays until the student presses Done.
      setLesson((current) => current && { ...current, waiting: false, finished: true })
    }
  }, [orb, resolveStepArea])

  const [boardController] = useState<WhiteboardController>(() => ({
    isReady: () => engineRef.current !== null && animatorRef.current !== null,
    play: async (planned, stepCommentary, imageRegion, imageText) => {
      const engine = engineRef.current
      const animator = animatorRef.current
      const editor = editorRef.current
      if (!engine || !animator || !editor) throw new Error("Whiteboard not ready")
      // Never draw over what's already on the board: slide the lesson into clear space first.
      const sequence = placeLesson(planned, boardObstacles(editor, planned)).steps
      adapterRef.current?.setImageRegion(imageRegion ?? null)
      adapterRef.current?.beginPlan()
      adapterRef.current?.setImageText(imageText ?? null)
      window.clearTimeout(homeTimerRef.current)
      window.clearTimeout(closeTimerRef.current)
      setLesson({
        id: ++lessonIdRef.current, steps: [], totalSteps: sequence.length, view: 0,
        waiting: false, finished: false, open: true, leaving: false,
      })

      // The drawing itself always happens in full; reduced motion only
      // shrinks the cosmetic reveal speed.
      const reduceMotion = prefersReducedMotion()
      const player = new DrawingPlayer({
        engine,
        animator,
        ...(reduceMotion ? { baseActionDurationMs: 1 } : {}),
        // Between steps, hold until the student presses Next (Stop aborts the wait).
        waitBetweenSteps: (_step, signal) => new Promise<void>((release) => {
          releaseStepRef.current = release
          signal.addEventListener("abort", () => release(), { once: true })
          setLesson((current) => current && { ...current, waiting: true })
        }),
        // As each object appears, bring it into view and move the tutor beside it.
        beforeReveal: (drawn, signal) => followDrawnRef.current?.(drawn, signal),
      })
      playerRef.current = player
      // Each step is explained as it starts, so the tutor narrates while it draws.
      let announcedStepIndex = -1
      const unsubscribe = player.subscribe((snapshot) => {
        if (snapshot.state === "drawing" && snapshot.stepIndex !== announcedStepIndex) {
          announcedStepIndex = snapshot.stepIndex
          stepHandlerRef.current?.(sequence, snapshot.stepIndex, stepCommentary[snapshot.stepIndex])
        }
      })

      try {
        await player.play(sequence)
        return player.getSnapshot()
      } finally {
        unsubscribe()
        playerRef.current = null
        endTurnRef.current?.()
      }
    },
    cancel: () => playerRef.current?.cancel(),
    getVisualObjects: () => adapterRef.current?.summarizeObjects() ?? [],
    getLayout: () => {
      const editor = editorRef.current
      if (!editor) return undefined
      const view = editor.getViewportPageBounds()
      const occupied = editor.getCurrentPageShapes().flatMap(shape => {
        const b = editor.getShapePageBounds(shape)
        return b ? [{ x: b.x, y: b.y, w: Math.max(1, b.w), h: Math.max(1, b.h) }] : []
      })
      const right = occupied.reduce((max, b) => Math.max(max, b.x + b.w), view.x)
      // With something selected, the answer belongs right beside it - not in the next empty space along.
      const selected = editor.getSelectedShapeIds().length > 0 ? editor.getSelectionPageBounds() : null
      return {
        viewport: { x: view.x, y: view.y, w: view.w, h: view.h },
        occupied: occupied.slice(-120),
        freshArea: selected
          ? { x: selected.x + selected.w + 40, y: selected.y, w: 900, h: Math.max(500, selected.h) }
          : { x: occupied.length ? right + 160 : view.x + 80, y: view.y + 80, w: 1000, h: 700 },
      }
    },
    placeQuestion: (source) => {
      if (!editorRef.current) throw new Error("Whiteboard not ready")
      return placeQuestionSheet(editorRef.current, source)
    },
    questionBounds: (id) => {
      const box = editorRef.current?.getShapePageBounds(id)
      return box ? { x: box.x, y: box.y, w: box.w, h: box.h } : undefined
    },
    findUnattachedQuestionImage: () => {
      const editor = editorRef.current
      return editor ? findUnattachedQuestionImage(editor) : undefined
    },
    exportQuestionImage: async (id) => {
      const editor = editorRef.current
      if (!editor) throw new Error("Whiteboard not ready")
      const shape = editor.getShape(id)
      let image: Awaited<ReturnType<typeof readQuestionImageBlob>>
      if (shape?.type === "image" && shape.props.assetId) {
        // The photo's own file, at its own resolution (with the shape's crop) - never a re-render of the
        // board, which would be limited to its on-screen size. Same extent as the shape, so marks map exactly.
        const url = await editor.resolveAssetUrl(shape.props.assetId, { shouldResolveToOriginal: true })
        if (!url) throw new Error("Couldn't read the question image")
        image = await readImageUrl(url, { ...QUESTION_IMAGE, crop: shape.props.crop ?? null })
      } else {
        // No padding: the image must cover exactly the shape's bounds, or the AI's marks on it land shifted.
        const { blob } = await editor.toImage([id], { format: "png", background: true, padding: 0, pixelRatio: 2 })
        image = await readQuestionImageBlob(blob)
      }
      markQuestionSourceAttached(editor, id)
      return image
    },
    getSelection: () => {
      const editor = editorRef.current
      if (!editor || editor.getSelectedShapeIds().length === 0) return undefined
      const labels = new Map((adapterRef.current?.summarizeObjects() ?? []).map((s) => [s.id, s.label]))
      const seen = new Set<string>()
      const objects = editor.getSelectedShapes().flatMap((selected) => {
        // A label stands for the shape it names.
        const owner = typeof selected.meta.recifeLabelOwner === "string" ? editor.getShape(selected.meta.recifeLabelOwner as TLShapeId) : undefined
        const shape = owner ?? selected
        const bounds = editor.getShapePageBounds(shape)
        if (seen.has(shape.id) || !bounds) return []
        seen.add(shape.id)
        const id = typeof shape.meta.recifeObjectId === "string" ? shape.meta.recifeObjectId : undefined
        const kind = typeof shape.meta.recifeKind === "string" ? shape.meta.recifeKind
          : shape.meta.recifeQuestionSource ? "question image"
          : shape.type === "image" ? "image"
          : shape.type === "text" ? "student text"
          : shape.type === "draw" ? "handwriting"
          : `student ${shape.type}`.slice(0, 40)
        const text = id ? labels.get(id) : shape.type === "text" ? renderPlaintextFromRichText(editor, shape.props.richText) : undefined
        return [{
          ...(id ? { id } : {}),
          kind,
          ...(text ? { label: text.slice(0, 200) } : {}),
          bounds: { x: bounds.x, y: bounds.y, w: Math.max(1, bounds.w), h: Math.max(1, bounds.h) },
        }]
      }).slice(0, 30)
      const region = editor.getSelectionPageBounds()
      if (!region || objects.length === 0) return undefined
      return { region: { x: region.x, y: region.y, w: Math.max(1, region.w), h: Math.max(1, region.h) }, objects }
    },
    readImageText: async (region) => {
      const editor = editorRef.current
      if (!editor) return null
      const area = new Box(region.x, region.y, region.w, region.h)
      const ids = editor.getCurrentPageShapes().filter((shape) => editor.getShapePageBounds(shape)?.collides(area)).map((shape) => shape.id)
      if (ids.length === 0) return null
      // A sharp, larger render of exactly that area (no padding), so small print reads well and boxes map back exactly.
      const scale = Math.min(3, 3000 / Math.max(region.w, region.h))
      const { blob } = await editor.toImage(ids, { format: "png", background: true, bounds: area, padding: 0, scale })
      return recognizeWords(blob)
    },
    captureSelection: async () => {
      const editor = editorRef.current
      const ids = editor?.getSelectedShapeIds() ?? []
      const bounds = editor?.getSelectionPageBounds()
      if (!editor || ids.length === 0 || !bounds) return undefined
      // Exactly the selected area, no padding, so marks the tutor places on this image land precisely -
      // rendered sharp (about 2048px on its long side), not at whatever size it happens to be on screen.
      const { blob } = await editor.toImage([...ids], {
        format: "png", background: true, bounds: new Box(bounds.x, bounds.y, bounds.w, bounds.h), padding: 0,
        pixelRatio: exportPixelRatio(bounds, QUESTION_IMAGE.maxSide!),
      })
      return {
        kind: "selection",
        image: await readQuestionImageBlob(blob, QUESTION_IMAGE),
        region: { x: bounds.x, y: bounds.y, w: Math.max(1, bounds.w), h: Math.max(1, bounds.h) },
      }
    },
    captureStudentWork: async (alsoInclude, detail) => {
      const editor = editorRef.current
      if (!editor) return undefined
      const viewportBounds = editor.getViewportPageBounds()
      const all = editor.getCurrentPageShapes()
      const studentIds = focusedStudentWork({
        selected: editor.getSelectedShapes(),
        visible: all.filter((shape) => {
          const bounds = editor.getShapePageBounds(shape)
          return bounds ? viewportBounds.collides(bounds) : false
        }),
        all,
      }).map((shape) => shape.id)
      if (studentIds.length === 0) return undefined
      const ids: TLShapeId[] = [...studentIds, ...alsoInclude.filter((id) => editor.getShape(id))]
      const bounds = editor.getShapesPageBounds(ids)
      if (!bounds) return undefined
      // Export exactly these page bounds (no padding), so the image's pixels map
      // linearly onto `region` - the prompt's fraction-to-coordinate formula relies on it.
      const options = detail === "context" ? CONTEXT_IMAGE : QUESTION_IMAGE
      const { blob } = await editor.toImage(ids, {
        format: "png",
        background: true,
        bounds: new Box(bounds.x, bounds.y, bounds.w, bounds.h),
        padding: 0,
        pixelRatio: exportPixelRatio(bounds, options.maxSide!),
      })
      const image = await readQuestionImageBlob(blob, options)
      const shapes = studentIds.slice(0, 80).flatMap(id => {
        const shape = editor.getShape(id)
        const b = editor.getShapePageBounds(id)
        return shape && b ? [{ id, type: shape.type, bounds: { x: b.x, y: b.y, w: Math.max(1, b.w), h: Math.max(1, b.h) } }] : []
      })
      return { kind: "board", image, shapes, region: { x: bounds.x, y: bounds.y, w: Math.max(1, bounds.w), h: Math.max(1, bounds.h) } }
    },
  }))

  const tutor = useTutor(boardController)

  const companionState: CompanionState =
    tutor.phase === "thinking" ? "thinking"
      : speaking || tutor.note || lesson?.waiting ? "speaking"
      : tutor.phase === "drawing" ? "drawing" : "idle"

  const shownStep = lesson?.open ? lesson.steps[lesson.view] : undefined
  const speech: TutorSpeech | null = lesson && shownStep ? {
    id: lesson.id * 1000 + lesson.view,
    text: shownStep.text,
    step: lesson.view + 1,
    totalSteps: lesson.totalSteps,
    avoid: shownStep.avoid,
    leaving: lesson.leaving,
    canGoBack: lesson.view > 0,
    // Reviewing an earlier step, or the step has finished drawing: Next. End of the lesson: Done. Still drawing: wait.
    next: lesson.view < lesson.steps.length - 1 || lesson.waiting ? "next" : lesson.finished ? "done" : "drawing",
  } : null

  return (
    <div className="flex h-dvh w-full flex-col bg-surface-subtle">
      {board ? (
        <BoardHeader
          boardId={board.id}
          title={board.title}
          status={saveStatus}
          editTitleOnOpen={board.snapshot === null && board.title === "Untitled whiteboard"}
          stylePanelHidden={stylePanelHidden}
          onToggleStylePanel={() => setStylePanelHidden(!stylePanelHidden)}
        />
      ) : (
        <header className="flex h-12 shrink-0 items-center border-b border-border-subtle bg-surface px-4">
          <RecifeWordmark />
        </header>
      )}

      <main ref={mainRef} className="relative flex-1 overflow-hidden">
        <WhiteboardSection
          onEditorMount={handleEditorMount}
          board={board}
          onSaveStatus={setSaveStatus}
          hideStylePanel={Boolean(board) && stylePanelHidden}
        />
        {mountedEditor && viewport && orb.position && (
          <AiCompanion
            position={orb.position}
            viewport={viewport}
            state={companionState}
            busy={tutor.phase !== "idle"}
            acceptsFollowUp={tutor.phase === "drawing" && !!lesson?.waiting}
            note={tutor.note}
            onDismissNote={tutor.dismissNote}
            onUserMove={orb.placeByUser}
            onAsk={tutor.ask}
            onRetry={tutor.retry}
            onCancel={tutor.cancel}
            speech={speech}
            onSpeechBack={lessonBack}
            onSpeechNext={lessonNext}
            lessonSteps={lesson?.steps.map((step) => step.text) ?? []}
            selectionCount={selectionCount}
            onClearSelection={() => mountedEditor?.selectNone()}
            hasQuestionSource={tutor.hasQuestionSource}
            onClearQuestionSource={tutor.clearQuestionSource}
            suggestions={tutor.suggestions}
          />
        )}
      </main>
    </div>
  )
}
