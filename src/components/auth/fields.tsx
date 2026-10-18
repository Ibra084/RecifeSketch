"use client"

/**
 * Form primitives for the auth screens. Classes are carried over from the
 * original Recife AI sign-in panel (RecifeAI/src/components/AuthPanel.tsx):
 * 2xl translucent inputs with a blue-500 focus ring, leading 16px icon,
 * show/hide eye toggle, xl blue-600 submit with lift + press, and the
 * red-50 error banner.
 */

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react"
import { useFormStatus } from "react-dom"
import { cn } from "cn"
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock, Mail, UserRound } from "lucide-react"
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/identity"

const INPUT_BASE =
  "w-full py-3.5 text-[15px] rounded-2xl border bg-white/50 backdrop-blur-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white/80 focus:ring-4 transition-all duration-150"
const INPUT_OK = "border-black/[0.08] focus:border-blue-500 focus:ring-blue-500/15"
const INPUT_ERR = "border-red-300 focus:border-red-400 focus:ring-red-500/10"

const ICONS = { mail: Mail, lock: Lock, user: UserRound } as const

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  label: string
  icon?: keyof typeof ICONS
  error?: string
  hint?: ReactNode
  /** Rendered at the right of the label row (e.g. "Forgot password?"). */
  labelAside?: ReactNode
  trailing?: ReactNode
}

export function TextField({ label, icon, error, hint, labelAside, trailing, id, ...input }: TextFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
  const Icon = icon ? ICONS[icon] : null

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <label htmlFor={inputId} className="text-[13px] font-medium text-gray-700">
          {label}
        </label>
        {labelAside}
      </div>
      <div className="relative">
        {Icon && (
          <Icon
            aria-hidden
            strokeWidth={1.6}
            className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-300"
          />
        )}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(INPUT_BASE, error ? INPUT_ERR : INPUT_OK, Icon ? "pl-11" : "pl-4", trailing ? "pr-11" : "pr-4")}
          {...input}
        />
        {trailing}
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="flex items-start gap-1.5 px-1 text-[13px] text-red-600">
          <AlertCircle aria-hidden className="mt-[2px] h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="px-1 text-[12.5px] leading-snug text-gray-400">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function PasswordField(props: Omit<TextFieldProps, "type" | "icon" | "trailing">) {
  const [visible, setVisible] = useState(false)
  // Every password box gets a hint: entering an existing password, or choosing a new one.
  const placeholder = props.placeholder ?? (props.autoComplete === "new-password" ? `At least ${PASSWORD_MIN_LENGTH} characters` : "Your password")
  return (
    <TextField
      {...props}
      placeholder={placeholder}
      type={visible ? "text" : "password"}
      icon="lock"
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-gray-300 transition-all duration-150 hover:text-gray-500 active:scale-90"
        >
          {visible ? <EyeOff className="h-4 w-4" strokeWidth={1.6} /> : <Eye className="h-4 w-4" strokeWidth={1.6} />}
        </button>
      }
    />
  )
}

export function Checkbox({
  name,
  children,
  error,
  checked,
  onChange,
}: {
  name: string
  children: ReactNode
  error?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-2xl px-1 py-1">
        <input
          id={id}
          type="checkbox"
          name={name}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(
            "mt-[3px] h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-blue-600",
            error && "outline outline-2 outline-red-300"
          )}
        />
        <span className="text-[13px] leading-relaxed text-gray-500">{children}</span>
      </label>
      {error && (
        <p id={`${id}-error`} className="flex items-start gap-1.5 px-1 text-[13px] text-red-600">
          <AlertCircle aria-hidden className="mt-[2px] h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          {error}
        </p>
      )}
    </div>
  )
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
      {children}
    </div>
  )
}

export function NoticeBanner({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="flex items-start gap-2.5 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">
      <CheckCircle2 aria-hidden className="mt-[1px] h-4 w-4 shrink-0" strokeWidth={2} />
      <div>{children}</div>
    </div>
  )
}

export function SubmitButton({ children, pendingLabel }: { children: ReactNode; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition-all duration-150 hover:-translate-y-px hover:bg-blue-700 active:scale-[0.98] disabled:opacity-60 disabled:hover:translate-y-0"
    >
      {pending ? (
        <>
          <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  )
}
