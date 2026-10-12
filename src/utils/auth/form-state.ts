/**
 * Shared shape for Server Action results consumed via `useActionState`.
 *
 * Lives outside the `"use server"` action files because those may only export
 * async functions.
 */
export type FormStatus = "idle" | "success" | "error";

export type FieldErrors<Field extends string> = Partial<Record<Field, string>>;

export interface FormState<Field extends string> {
  status: FormStatus;
  /** Form-level message (banner). */
  message: string | null;
  /** Per-field inline validation messages. */
  fieldErrors: FieldErrors<Field>;
  /**
   * Non-sensitive values echoed back so inputs can be re-populated after
   * React resets the form. Passwords are never echoed.
   */
  values: Partial<Record<Field, string>>;
}

export function createInitialFormState<Field extends string>(): FormState<Field> {
  return { status: "idle", message: null, fieldErrors: {}, values: {} };
}

export function hasFieldErrors<Field extends string>(errors: FieldErrors<Field>): boolean {
  return Object.values(errors).some(Boolean);
}
