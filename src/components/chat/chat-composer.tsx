"use client"

import { useRef, useState, type KeyboardEvent } from "react"
import { Send, Paperclip, X } from "lucide-react"
import type { QuestionSource } from "@/lib/ai/question-source"
import { readQuestionImage } from "./question-image"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface ChatComposerProps {
  onSend: (content: string, source?: QuestionSource) => void
  disabled?: boolean
}

export function ChatComposer({ onSend, disabled }: ChatComposerProps) {
  const [value, setValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [paperMode, setPaperMode] = useState(false)
  const [questionText, setQuestionText] = useState("")
  const [image, setImage] = useState<QuestionSource["image"]>()
  const [imageName, setImageName] = useState("")
  const [attachmentError, setAttachmentError] = useState("")
  const [readingImage, setReadingImage] = useState(false)
  const hasSource = paperMode && Boolean(questionText.trim() || image)

  function handleSend() {
    if ((!value.trim() && !hasSource) || disabled || readingImage) return
    onSend(value.trim() || "Help me understand and annotate this past-paper question, starting with a hint.",
      hasSource ? { ...(questionText.trim() ? { text: questionText.trim() } : {}), ...(image ? { image } : {}) } : undefined)
    setValue("")
    setQuestionText("")
    setImage(undefined)
    setImageName("")
    setPaperMode(false)
    textareaRef.current?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t border-border-subtle p-3">
      <button type="button" disabled={disabled} onClick={() => setPaperMode(!paperMode)} className="mb-2 flex items-center gap-2 text-[13px] text-ink-secondary">
        <Paperclip className="h-4 w-4" /> {paperMode ? "Close question attachment" : "Add past-paper question"}
      </button>
      {paperMode && <div className="mb-3 space-y-2 rounded-lg border border-border-subtle p-2">
        <Textarea value={questionText} onChange={event => setQuestionText(event.target.value)} maxLength={6000} disabled={disabled}
          placeholder="Paste the question here, or upload a question image below" aria-label="Past-paper question text" rows={4} />
        <label className="block text-xs text-ink-secondary">Question image (PNG, JPG or WebP)
          <input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload question image" disabled={disabled || readingImage}
            className="mt-1 block w-full text-xs" onChange={async event => {
              const file = event.target.files?.[0]
              if (!file) return
              setReadingImage(true); setAttachmentError("")
              try { setImage(await readQuestionImage(file)); setImageName(file.name) }
              catch (error) { setAttachmentError(error instanceof Error ? error.message : "Couldn't read image") }
              finally { setReadingImage(false); event.target.value = "" }
            }} />
        </label>
        {image && <div className="flex items-center justify-between text-xs"><span>{imageName} ready</span>
          <button type="button" aria-label="Remove question image" onClick={() => { setImage(undefined); setImageName("") }}><X className="h-4 w-4" /></button></div>}
        {readingImage && <p className="text-xs">Preparing image…</p>}
        {attachmentError && <p role="alert" className="text-xs text-red-600">{attachmentError}</p>}
        <p className="text-xs text-ink-secondary">The question stays on the board. Sending shares it with the AI tutor for editable annotations.</p>
      </div>}
      <div className="flex items-end gap-2">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask a question..."
        rows={1}
        disabled={disabled}
        aria-label="Message"
        className="max-h-32 min-h-9 resize-none border-border-subtle bg-surface py-2 text-base shadow-none focus-visible:ring-1 focus-visible:ring-ring md:text-[13px]"
      />
      <Button
        size="icon"
        onClick={handleSend}
        disabled={disabled || readingImage || (!value.trim() && !hasSource)}
        aria-label="Send message"
        className="tap-target shrink-0 rounded-xl"
      >
        <Send className="h-4 w-4" />
      </Button>
      </div>
    </div>
  )
}
