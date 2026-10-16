/** Student-friendly copy for Supabase Auth error codes. Never echoes raw server text. */
export function friendlyAuthError(error: { code?: string; status?: number; message?: string } | null): string {
  switch (error?.code) {
    case "invalid_credentials":
      return "That email, alias or password doesn't match. Check them and try again."
    case "email_not_confirmed":
      return "Please verify your email first. We sent you a link when you signed up."
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many attempts. Please wait a few minutes and try again."
    case "weak_password":
      return "That password is too easy to guess. Try a longer one."
    case "same_password":
      return "Your new password must be different from your current one."
    case "email_address_invalid":
      return "That email address doesn't look right."
    case "signup_disabled":
      return "New accounts can't be created right now."
    case "user_banned":
      return "This account has been paused. Please speak to your teacher."
    case "session_not_found":
    case "session_expired":
    case "refresh_token_not_found":
      return "Your session has expired. Please sign in again."
  }
  // The before-user-created hook rejects school addresses with HTTP 403.
  if (error?.status === 403 && /school email/i.test(error.message ?? "")) {
    return "School email addresses can't be used. Please use a personal email address."
  }
  if (error?.status === 429) return "Too many attempts. Please wait a few minutes and try again."
  return "Something went wrong on our side. Please try again."
}
