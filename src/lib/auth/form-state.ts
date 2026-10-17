/** Shape returned by every auth server action to its `useActionState` form. */
export interface FormState {
  /** Form-level error banner. */
  error?: string
  /** Per-field validation messages, keyed by input name. */
  fieldErrors?: Partial<Record<string, string>>
  /** Neutral success/info message (e.g. "check your inbox"). */
  message?: string
}

export const initialFormState: FormState = {}
