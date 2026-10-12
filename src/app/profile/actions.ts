"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthErrorMessage, logAuthError } from "@/utils/auth/errors";
import type { FormState } from "@/utils/auth/form-state";
import {
  readFormValues,
  validatePasswordUpdate,
  validateProfile,
  type PasswordField,
  type ProfileField,
} from "@/utils/auth/validation";
import { createClient } from "@/utils/supabase/server";

const SESSION_EXPIRED = "Your session has expired. Please sign in again.";

export async function updateProfile(
  _prevState: FormState<ProfileField>,
  formData: FormData
): Promise<FormState<ProfileField>> {
  const values = readFormValues(formData, ["fullName"] as const);
  const result = validateProfile(formData);
  if (!result.ok) {
    return { status: "error", message: null, fieldErrors: result.errors, values };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: SESSION_EXPIRED, fieldErrors: {}, values };
  }

  const { fullName } = result.data;
  if (user.user_metadata?.full_name === fullName) {
    return {
      status: "success",
      message: "Your details are already up to date.",
      fieldErrors: {},
      values: { fullName },
    };
  }

  const { error } = await supabase.auth.updateUser({ data: { full_name: fullName } });
  if (error) {
    logAuthError("updateProfile", error);
    return { status: "error", message: getAuthErrorMessage(error), fieldErrors: {}, values };
  }

  revalidatePath("/profile");
  return { status: "success", message: "Profile updated.", fieldErrors: {}, values: { fullName } };
}

export async function updatePassword(
  _prevState: FormState<PasswordField>,
  formData: FormData
): Promise<FormState<PasswordField>> {
  const result = validatePasswordUpdate(formData);
  if (!result.ok) {
    return { status: "error", message: null, fieldErrors: result.errors, values: {} };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: SESSION_EXPIRED, fieldErrors: {}, values: {} };
  }

  const { error } = await supabase.auth.updateUser({ password: result.data.password });
  if (error) {
    logAuthError("updatePassword", error);
    const message = getAuthErrorMessage(error);
    // Surface password-specific problems inline on the field.
    if (error.code === "same_password" || error.code === "weak_password") {
      return { status: "error", message: null, fieldErrors: { password: message }, values: {} };
    }
    return { status: "error", message, fieldErrors: {}, values: {} };
  }

  revalidatePath("/profile");
  return { status: "success", message: "Your password has been updated.", fieldErrors: {}, values: {} };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) logAuthError("signOut", error);

  revalidatePath("/", "layout");
  redirect("/login");
}
