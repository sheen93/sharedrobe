import type { AuthError } from "@supabase/supabase-js";
import { PASSWORD_MIN_LENGTH } from "./validation";

const FRIENDLY_MESSAGES: Partial<Record<string, string>> = {
  invalid_credentials: "That email and password don't match our records.",
  email_not_confirmed:
    "Please confirm your email address first — check your inbox for the confirmation link.",
  user_already_exists: "An account with this email already exists. Try signing in instead.",
  email_exists: "An account with this email already exists. Try signing in instead.",
  email_address_invalid: "Enter a valid email address, like name@example.com.",
  weak_password: `Choose a stronger password — at least ${PASSWORD_MIN_LENGTH} characters, mixing letters and numbers.`,
  same_password: "Your new password must be different from your current password.",
  signup_disabled: "New sign-ups are currently disabled.",
  email_provider_disabled: "Email sign-in isn't enabled for this project yet.",
  over_request_rate_limit: "Too many attempts. Please wait a moment and try again.",
  over_email_send_rate_limit:
    "We've sent too many emails recently. Please wait a few minutes and try again.",
  reauthentication_needed:
    "For your security, please sign out and sign back in before changing your password.",
  session_not_found: "Your session has expired. Please sign in again.",
  session_expired: "Your session has expired. Please sign in again.",
  otp_expired: "That link has expired. Please request a new one.",
};

const DEFAULT_MESSAGE = "Something went wrong. Please try again.";

/**
 * Map a Supabase AuthError to user-facing copy. Unknown errors fall back to a
 * generic message so internal details never leak to the UI.
 */
export function getAuthErrorMessage(error: AuthError | null | undefined, fallback = DEFAULT_MESSAGE): string {
  if (!error) return fallback;
  const byCode = error.code ? FRIENDLY_MESSAGES[error.code] : undefined;
  if (byCode) return byCode;
  if (error.status === 429) return FRIENDLY_MESSAGES.over_request_rate_limit ?? fallback;
  return fallback;
}

/** Server-side log line without PII (no emails or tokens). */
export function logAuthError(context: string, error: AuthError): void {
  console.error(`[auth:${context}]`, { code: error.code, status: error.status, message: error.message });
}
