"use client"

import { useRef, useState, type KeyboardEvent } from "react"
import { Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface ChatComposerProps {
  onSend: (content: string) => void
  disabled?: boolean
}

export function ChatComposer({ onSend, disabled }: ChatComposerProps) {
  const [value, setValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleSend() {
    if (!value.trim() || disabled) return
    onSend(value)
    setValue("")
    textareaRef.current?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex items-end gap-2 border-t border-border-subtle p-3">
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
        disabled={disabled || !value.trim()}
        aria-label="Send message"
        className="tap-target shrink-0 rounded-xl"
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  )
}
