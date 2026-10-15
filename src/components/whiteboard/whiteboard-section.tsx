"use client"

import { useState } from "react"
import { Tldraw, useValue, type Editor, type TLComponents } from "tldraw"
import "tldraw/tldraw.css"
import { WhiteboardToolbar } from "./whiteboard-toolbar"

// Recife Sketch brings its own minimal floating toolbar (see
// WhiteboardToolbar), so every piece of tldraw's default chrome is hidden
// here. The canvas itself (drawing, selection, pan/zoom, keyboard
// shortcuts) is untouched — only the UI overlays are suppressed.
const HIDDEN_COMPONENTS: TLComponents = {
  MainMenu: null,
  PageMenu: null,
  NavigationPanel: null,
  Toolbar: null,
  StylePanel: null,
  MenuPanel: null,
  TopPanel: null,
  SharePanel: null,
  DebugPanel: null,
  DebugMenu: null,
  HelperButtons: null,
  Minimap: null,
  ZoomMenu: null,
  ActionsMenu: null,
  QuickActions: null,
  HelpMenu: null,
  KeyboardShortcutsDialog: null,
  CursorChatBubble: null,
  PeopleMenu: null,
  PeopleMenuAvatar: null,
  PeopleMenuItem: null,
  PeopleMenuFacePile: null,
  FollowingIndicator: null,
  UserPresenceEditor: null,
}

/** A quiet first-run hint, shown only while the board has nothing on it yet. */
function WhiteboardEmptyHint({ editor }: { editor: Editor | null }) {
  const isEmpty = useValue(
    "is board empty",
    () => (editor ? editor.getCurrentPageShapeIds().size === 0 : false),
    [editor]
  )

  if (!isEmpty) return null

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
      <p className="max-w-[260px] text-center text-[13px] leading-relaxed text-ink-muted">
        Draw freely, or ask Recife a question in the chat panel to start a lesson here.
      </p>
    </div>
  )
}

interface WhiteboardSectionProps {
  /** Called once, in addition to the internal toolbar wiring, when tldraw mounts. */
  onEditorMount?: (editor: Editor) => void
}

export function WhiteboardSection({ onEditorMount }: WhiteboardSectionProps) {
  const [editor, setEditor] = useState<Editor | null>(null)

  function handleMount(mounted: Editor) {
    setEditor(mounted)
    onEditorMount?.(mounted)
  }

  return (
    <div className="relative h-full w-full bg-surface-subtle">
      <Tldraw
        persistenceKey="recife-sketch-board"
        components={HIDDEN_COMPONENTS}
        onMount={handleMount}
      />
      <WhiteboardEmptyHint editor={editor} />
      <WhiteboardToolbar editor={editor} />
    </div>
  )
}
