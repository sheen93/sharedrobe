import type { FieldErrors } from "./form-state";
import { hasFieldErrors } from "./form-state";

/**
 * Pure validators shared by client forms (instant feedback) and Server
 * Actions (authoritative). Never trust the client-side pass alone.
 */

export const NAME_MAX_LENGTH = 80;
export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt (used by Supabase Auth) ignores bytes beyond 72. */
export const PASSWORD_MAX_LENGTH = 72;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SignInField = "email" | "password";
export type SignUpField = "fullName" | "email" | "password";
export type ProfileField = "fullName";
export type PasswordField = "password" | "confirmPassword";

export type ValidationResult<Data, Field extends string> =
  | { ok: true; data: Data }
  | { ok: false; errors: FieldErrors<Field> };

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function finalize<Data, Field extends string>(
  data: Data,
  errors: FieldErrors<Field>
): ValidationResult<Data, Field> {
  return hasFieldErrors(errors) ? { ok: false, errors } : { ok: true, data };
}

function validateEmail(email: string): string | undefined {
  if (!email) return "Enter your email address.";
  if (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) {
    return "Enter a valid email address, like name@example.com.";
  }
  return undefined;
}

function validateFullName(fullName: string): string | undefined {
  if (!fullName) return "Enter your name.";
  if (fullName.length > NAME_MAX_LENGTH) {
    return `Keep your name under ${NAME_MAX_LENGTH} characters.`;
  }
  return undefined;
}

function validateNewPassword(password: string): string | undefined {
  if (!password) return "Enter a password.";
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Use ${PASSWORD_MAX_LENGTH} characters or fewer.`;
  }
  return undefined;
}

/** Collapse internal whitespace so "  Sophia   Chen " becomes "Sophia Chen". */
export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateSignIn(
  formData: FormData
): ValidationResult<{ email: string; password: string }, SignInField> {
  const email = normalizeEmail(readString(formData, "email"));
  const password = readString(formData, "password");
  const errors: FieldErrors<SignInField> = {
    email: validateEmail(email),
    password: password ? undefined : "Enter your password.",
  };
  return finalize({ email, password }, errors);
}

export function validateSignUp(
  formData: FormData
): ValidationResult<{ fullName: string; email: string; password: string }, SignUpField> {
  const fullName = normalizeName(readString(formData, "fullName"));
  const email = normalizeEmail(readString(formData, "email"));
  const password = readString(formData, "password");
  const errors: FieldErrors<SignUpField> = {
    fullName: validateFullName(fullName),
    email: validateEmail(email),
    password: validateNewPassword(password),
  };
  return finalize({ fullName, email, password }, errors);
}

export function validateProfile(
  formData: FormData
): ValidationResult<{ fullName: string }, ProfileField> {
  const fullName = normalizeName(readString(formData, "fullName"));
  return finalize({ fullName }, { fullName: validateFullName(fullName) });
}

export function validatePasswordUpdate(
  formData: FormData
): ValidationResult<{ password: string }, PasswordField> {
  const password = readString(formData, "password");
  const confirmPassword = readString(formData, "confirmPassword");
  const errors: FieldErrors<PasswordField> = {
    password: validateNewPassword(password),
    confirmPassword: !confirmPassword
      ? "Re-enter your new password."
      : confirmPassword !== password
        ? "Passwords don't match."
        : undefined,
  };
  return finalize({ password }, errors);
}

/** Read the echo-able (non-secret) values from a form submission. */
export function readFormValues<Field extends string>(
  formData: FormData,
  fields: readonly Field[]
): Partial<Record<Field, string>> {
  const values: Partial<Record<Field, string>> = {};
  fields.forEach((field) => {
    values[field] = readString(formData, field);
  });
  return values;
}
