/**
 * Error categorizer and human-readable message resolver for closet item uploads.
 * Handles missing file, session expiry, storage bucket rejections, DB ENUM constraints, and RLS violations.
 */

export const VALID_ENUM_CATEGORIES = [
  "Tops",
  "Bottoms",
  "Dresses",
  "Outerwear",
  "Shoes",
  "Bags",
  "Accessories",
] as const;

export type ValidEnumCategory = (typeof VALID_ENUM_CATEGORIES)[number];

export type FormErrorType =
  | "no_file"
  | "no_title"
  | "session_expired"
  | "storage_rejected"
  | "enum_violation"
  | "rls_violation"
  | "generic";

export interface FormError {
  type: FormErrorType;
  message: string;
}

export function isValidCategory(category: string): category is ValidEnumCategory {
  return VALID_ENUM_CATEGORIES.includes(category as ValidEnumCategory);
}

export function validateUploadInputs(
  file: unknown,
  title: string,
  category?: string
): FormError | null {
  if (!file) {
    return {
      type: "no_file",
      message: "Please select or capture a photo of your clothing item before submitting.",
    };
  }

  if (!title || !title.trim()) {
    return {
      type: "no_title",
      message: "Please enter a descriptive item name (e.g., Linen Summer Dress).",
    };
  }

  if (category && !isValidCategory(category)) {
    return {
      type: "enum_violation",
      message: `Invalid clothing category '${category}'. Must be one of: ${VALID_ENUM_CATEGORIES.join(", ")}.`,
    };
  }

  return null;
}

export function resolveSessionError(
  user: { id?: string } | null,
  authError?: unknown
): FormError | null {
  if (authError || !user || !user.id) {
    return {
      type: "session_expired",
      message:
        "Your session has expired or you are not signed in. Please sign in again to add items to your closet.",
    };
  }
  return null;
}

export function resolveStorageError(
  uploadError: {
    message?: string;
    statusCode?: string | number;
    status?: number;
  } | null
): FormError | null {
  if (!uploadError) return null;

  const errorMsg = uploadError.message || "";
  const statusCode = uploadError.statusCode ?? uploadError.status;

  const isBucketNotFound =
    errorMsg.toLowerCase().includes("bucket not found") ||
    statusCode === 404 ||
    statusCode === "404";

  const isPermissionDenied =
    errorMsg.toLowerCase().includes("permission denied") ||
    errorMsg.toLowerCase().includes("row-level security") ||
    errorMsg.toLowerCase().includes("policy") ||
    statusCode === 403 ||
    statusCode === "403";

  const isPayloadTooLarge =
    errorMsg.toLowerCase().includes("payload too large") ||
    errorMsg.toLowerCase().includes("entity too large") ||
    errorMsg.toLowerCase().includes("file size") ||
    statusCode === 413 ||
    statusCode === "413";

  const isNetworkError =
    errorMsg.toLowerCase().includes("failed to fetch") ||
    errorMsg.toLowerCase().includes("network error") ||
    errorMsg.toLowerCase().includes("connection");

  if (isBucketNotFound) {
    return {
      type: "storage_rejected",
      message:
        "The 'wardrobe' storage bucket was not found in Supabase. Please ensure a public bucket named 'wardrobe' is created in the Supabase Dashboard.",
    };
  }

  if (isPermissionDenied) {
    return {
      type: "storage_rejected",
      message:
        "Storage upload rejected: Permission denied. Please ensure the storage RLS policy allows authenticated uploads into the 'wardrobe' bucket.",
    };
  }

  if (isPayloadTooLarge) {
    return {
      type: "storage_rejected",
      message:
        "The selected photo exceeds the maximum storage upload limit. Please choose a smaller photo or compress the image.",
    };
  }

  if (isNetworkError) {
    return {
      type: "storage_rejected",
      message:
        "Network connection failed during storage upload. Please check your internet connection and try again.",
    };
  }

  return {
    type: "storage_rejected",
    message: `Storage upload failed: ${errorMsg}. Please check bucket permissions or try a different image.`,
  };
}

export function resolveDatabaseError(
  dbError: {
    code?: string;
    message?: string;
    details?: string;
  } | null
): FormError | null {
  if (!dbError) return null;

  const dbMsg = dbError.message || "";
  const dbDetails = dbError.details || "";
  const combined = `${dbMsg} ${dbDetails}`.toLowerCase();

  const isEnumViolation =
    dbError.code === "22P02" ||
    combined.includes("invalid input value for enum") ||
    combined.includes("item_category");

  if (isEnumViolation) {
    return {
      type: "enum_violation",
      message: `Database insert failed: Invalid category value for Postgres enum 'item_category'. Allowed values: ${VALID_ENUM_CATEGORIES.join(", ")}.`,
    };
  }

  const isRlsViolation =
    dbError.code === "42501" ||
    combined.includes("row-level security") ||
    combined.includes("policy") ||
    combined.includes("permission denied");

  if (isRlsViolation) {
    return {
      type: "rls_violation",
      message:
        "Database insert failed: Row-Level Security (RLS) violation. Ensure you are authenticated and migration 20261012000001_rls_insert_policy.sql is applied in Supabase.",
    };
  }

  if (dbError.code === "23503") {
    return {
      type: "generic",
      message:
        "Database foreign key error: User profile not recognized in authentication records. Please sign out and sign back in.",
    };
  }

  return {
    type: "generic",
    message: `Database insert failed: ${dbMsg}`,
  };
}
