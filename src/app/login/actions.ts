"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthErrorMessage, logAuthError } from "@/utils/auth/errors";
import type { FormState } from "@/utils/auth/form-state";
import {
  readFormValues,
  validateSignIn,
  validateSignUp,
  type SignInField,
  type SignUpField,
} from "@/utils/auth/validation";
import { createClient } from "@/utils/supabase/server";

/** Resolve the public origin of this request for email redirect links. */
async function getRequestOrigin(): Promise<string | null> {
  const headerList = await headers();
  const origin = headerList.get("origin");
  if (origin) return origin;
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!host) return null;
  const protocol = headerList.get("x-forwarded-proto") ?? "https";
  return `${protocol}://${host}`;
}

export async function signIn(
  _prevState: FormState<SignInField>,
  formData: FormData
): Promise<FormState<SignInField>> {
  const values = readFormValues(formData, ["email"] as const);
  const result = validateSignIn(formData);
  if (!result.ok) {
    return { status: "error", message: null, fieldErrors: result.errors, values };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(result.data);

  if (error) {
    logAuthError("signIn", error);
    return { status: "error", message: getAuthErrorMessage(error), fieldErrors: {}, values };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signUp(
  _prevState: FormState<SignUpField>,
  formData: FormData
): Promise<FormState<SignUpField>> {
  const values = readFormValues(formData, ["fullName", "email"] as const);
  const result = validateSignUp(formData);
  if (!result.ok) {
    return { status: "error", message: null, fieldErrors: result.errors, values };
  }

  const { fullName, email, password } = result.data;
  const origin = await getRequestOrigin();
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      // Handles the default (PKCE `?code=`) email template; the recommended
      // custom template links to /auth/confirm with a token_hash instead.
      ...(origin ? { emailRedirectTo: `${origin}/auth/confirm` } : {}),
    },
  });

  if (error) {
    logAuthError("signUp", error);
    return { status: "error", message: getAuthErrorMessage(error), fieldErrors: {}, values };
  }

  // Email confirmation disabled in Supabase → a session is returned immediately.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/");
  }

  return {
    status: "success",
    message: `Almost there! We've sent a confirmation link to ${email}. Open it to activate your account, then sign in.`,
    fieldErrors: {},
    values: {},
  };
}
