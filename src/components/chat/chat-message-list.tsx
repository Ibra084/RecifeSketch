"use client"

import { useEffect, useRef } from "react"
import { Sparkles, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { ChatMessage } from "./use-tutor-chat"

interface ChatMessageListProps {
  messages: ChatMessage[]
  isThinking: boolean
  isDrawing?: boolean
  onCancel?: () => void
  /** Shown as tappable suggestions in the empty state; omit to hide them. */
  onQuickPrompt?: (prompt: string) => void
}

const QUICK_PROMPTS = [
  "How does a transformer work?",
  "Explain photosynthesis",
  "Plot y = x²",
  "Why is the sky blue?",
]

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1" aria-hidden="true">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 rounded-full bg-ink-faint motion-safe:animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  )
}

export function ChatMessageList({
  messages,
  isThinking,
  isDrawing,
  onCancel,
  onQuickPrompt,
}: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [messages.length, isThinking, isDrawing])

  if (messages.length === 0 && !isThinking && !isDrawing) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-subtle">
          <Sparkles className="h-5 w-5 text-accent" />
        </div>
        <p className="text-[13px] font-medium text-ink">Ask Recife anything</p>
        <p className="max-w-[220px] text-[13px] leading-relaxed text-ink-muted">
          Explanations will appear here, and get drawn directly onto the whiteboard.
        </p>
        {onQuickPrompt && (
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => onQuickPrompt(prompt)}
                className="rounded-lg bg-surface-sunken px-2.5 py-1.5 text-[11.5px] text-ink-secondary transition-colors hover:bg-accent-subtle hover:text-accent"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1">
      <div
        className="flex flex-col gap-3 px-4 py-4"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : message.variant === "error"
                    ? "border border-red-100 bg-red-50 text-red-700"
                    : "border border-border-subtle bg-surface-subtle text-ink"
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}

        {(isThinking || isDrawing) && (
          <div className="flex justify-start" aria-live="polite">
            <div className="flex items-center gap-2 rounded-2xl border border-border-subtle bg-surface-subtle px-3.5 py-2.5 text-[13px] text-ink-muted">
              {isDrawing ? (
                <>
                  <span className="text-ink-secondary">Drawing on the board…</span>
                  {onCancel && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={onCancel}
                      aria-label="Stop drawing"
                      className="h-5 w-5"
                    >
                      <Square className="h-3 w-3" />
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <span className="sr-only">Thinking…</span>
                  <ThinkingDots />
                </>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
