"use client"

import { useState } from "react"
import { useValue, type Editor } from "tldraw"
import {
  ArrowRight,
  Eraser,
  MousePointer2,
  Pencil,
  Redo2,
  Square,
  Trash,
  Undo2,
} from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface WhiteboardToolbarProps {
  editor: Editor | null
}

const TOOLS = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "draw", label: "Pen", icon: Pencil },
  { id: "geo", label: "Shape", icon: Square },
  { id: "arrow", label: "Arrow", icon: ArrowRight },
  { id: "eraser", label: "Erase", icon: Eraser },
] as const

export function WhiteboardToolbar({ editor }: WhiteboardToolbarProps) {
  const [isClearOpen, setIsClearOpen] = useState(false)

  const currentTool = useValue(
    "current tool",
    () => editor?.getCurrentToolId() ?? "select",
    [editor]
  )
  const canUndo = useValue("can undo", () => editor?.getCanUndo() ?? false, [editor])
  const canRedo = useValue("can redo", () => editor?.getCanRedo() ?? false, [editor])

  if (!editor) return null

  function handleClear() {
    if (!editor) return
    editor.deleteShapes(Array.from(editor.getCurrentPageShapeIds()))
    setIsClearOpen(false)
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center px-4">
      <div
        className="scroll-x-fade pointer-events-auto flex max-w-full items-center gap-1 rounded-full border border-border-subtle bg-surface/95 p-1.5 backdrop-blur-md"
        style={{ boxShadow: "var(--shadow-popover)" }}
      >
        {TOOLS.map(({ id, label, icon: Icon }) => {
          const isActive = currentTool === id
          return (
            <Tooltip key={id}>
              <TooltipTrigger
                render={
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    size="icon"
                    className="toolbar-tap-target rounded-full"
                  />
                }
                aria-label={label}
                aria-pressed={isActive}
                onClick={() => editor.setCurrentTool(id)}
              >
                <Icon className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent side="top">{label}</TooltipContent>
            </Tooltip>
          )
        })}

        <Separator orientation="vertical" className="mx-1 h-6" />

        <Tooltip>
          <TooltipTrigger
            render={<Button variant="ghost" size="icon" className="toolbar-tap-target rounded-full" />}
            aria-label="Undo"
            disabled={!canUndo}
            onClick={() => editor.undo()}
          >
            <Undo2 className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent side="top">Undo</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={<Button variant="ghost" size="icon" className="toolbar-tap-target rounded-full" />}
            aria-label="Redo"
            disabled={!canRedo}
            onClick={() => editor.redo()}
          >
            <Redo2 className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent side="top">Redo</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <AlertDialog open={isClearOpen} onOpenChange={setIsClearOpen}>
          <AlertDialogTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="toolbar-tap-target rounded-full text-destructive"
              />
            }
            aria-label="Clear board"
          >
            <Trash className="h-4 w-4" />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear the whole board?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes everything drawn on the whiteboard. This can&apos;t be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleClear}>Clear board</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
