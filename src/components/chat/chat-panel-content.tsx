"use client"

import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ChatComposer } from "./chat-composer"
import { ChatMessageList } from "./chat-message-list"
import type { ChatMessage } from "./use-tutor-chat"
import type { QuestionSource } from "@/lib/ai/question-source"

interface ChatPanelContentProps {
  messages: ChatMessage[]
  isThinking: boolean
  isDrawing?: boolean
  sendMessage: (content: string, source?: QuestionSource) => void
  cancel?: () => void
  onRequestClose?: () => void
  hasQuestionSource?: boolean
  clearQuestionSource?: () => void
}

export function ChatPanelContent({
  messages,
  isThinking,
  isDrawing,
  sendMessage,
  cancel,
  onRequestClose,
  hasQuestionSource,
  clearQuestionSource,
}: ChatPanelContentProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border-subtle px-4">
        <span className="text-[11px] font-bold tracking-wide text-ink-secondary uppercase">
          Tutor chat
        </span>
        {onRequestClose && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRequestClose}
            aria-label="Close chat"
            className="tap-target"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <ChatMessageList
        messages={messages}
        isThinking={isThinking}
        isDrawing={isDrawing}
        onCancel={cancel}
        onQuickPrompt={sendMessage}
      />
      {hasQuestionSource && <div className="flex items-center justify-between border-t border-border-subtle px-3 py-2 text-xs text-ink-secondary">
        <span>Past-paper question active</span>
        <button type="button" disabled={isThinking || isDrawing} onClick={clearQuestionSource}>New topic</button>
      </div>}
      <ChatComposer onSend={sendMessage} disabled={isThinking || isDrawing} />
    </div>
  )
}
