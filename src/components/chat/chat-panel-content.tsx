"use client"

import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ChatComposer } from "./chat-composer"
import { ChatMessageList } from "./chat-message-list"
import type { ChatMessage } from "./use-tutor-chat"

interface ChatPanelContentProps {
  messages: ChatMessage[]
  isThinking: boolean
  isDrawing?: boolean
  sendMessage: (content: string) => void
  cancel?: () => void
  onRequestClose?: () => void
}

export function ChatPanelContent({
  messages,
  isThinking,
  isDrawing,
  sendMessage,
  cancel,
  onRequestClose,
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
      <ChatComposer onSend={sendMessage} disabled={isThinking || isDrawing} />
    </div>
  )
}
