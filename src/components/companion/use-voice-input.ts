"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Speak a question instead of typing it, using the browser's own speech
 * recognition (Chrome, Edge, Safari). No audio reaches Recife's server - only
 * the recognised words, sent like a typed question. Browsers without it
 * (e.g. Firefox) simply don't show the microphone.
 */

// The Web Speech API isn't in TypeScript's DOM types yet: just the parts used here.
interface SpeechRecognitionResultLike { isFinal: boolean; 0: { transcript: string } }
interface SpeechRecognitionEventLike { results: ArrayLike<SpeechRecognitionResultLike> }
interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Allow it in your browser's site settings to speak your question.",
  "service-not-allowed": "Microphone access is blocked. Allow it in your browser's site settings to speak your question.",
  "no-speech": "I didn't hear anything - tap the microphone and try again.",
  "audio-capture": "No microphone was found.",
  network: "Speech recognition needs an internet connection.",
}

export function useVoiceInput(handlers: {
  /** The words so far, updated while the student speaks. */
  onTranscript: (text: string) => void
  /** They finished speaking: the whole question. */
  onFinished: (text: string) => void
}) {
  const [supported] = useState(() => recognitionCtor() !== null)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState("")
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const handlersRef = useRef(handlers)
  useEffect(() => {
    handlersRef.current = handlers
  })

  const stop = useCallback(() => recognitionRef.current?.stop(), [])

  const start = useCallback(() => {
    const Ctor = recognitionCtor()
    if (!Ctor || recognitionRef.current) return
    const recognition = new Ctor()
    recognition.lang = navigator.language || "en-GB"
    recognition.interimResults = true
    recognition.continuous = false // ends by itself when they stop talking
    let transcript = ""
    let failed = false
    recognition.onresult = (event) => {
      transcript = Array.from(event.results, (result) => result[0].transcript).join("").trim()
      handlersRef.current.onTranscript(transcript)
    }
    recognition.onerror = (event) => {
      if (event.error === "aborted") return
      failed = true
      setError(ERRORS[event.error] ?? "Speech recognition didn't work - try again, or type your question.")
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setListening(false)
      if (!failed && transcript) handlersRef.current.onFinished(transcript)
    }
    setError("")
    try {
      recognition.start()
      recognitionRef.current = recognition
      setListening(true)
    } catch {
      setError("Speech recognition didn't start - try again, or type your question.")
    }
  }, [])

  // Never leave the microphone on after the composer closes.
  useEffect(() => () => recognitionRef.current?.abort(), [])

  return { supported, listening, error, start, stop, clearError: () => setError("") }
}
