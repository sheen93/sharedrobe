/**
 * Error categorizer and human-readable message resolver for closet item uploads.
 * Handles missing file, session expiry, storage bucket rejections, and DB RLS violations.
 */

export type FormErrorType =
  | "no_file"
  | "no_title"
  | "session_expired"
  | "storage_rejected"
  | "rls_violation"
  | "generic";

export interface FormError {
  type: FormErrorType;
  message: string;
}

export function validateUploadInputs(file: unknown, title: string): FormError | null {
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

  return null;
}

export function resolveSessionError(user: { id?: string } | null, authError?: unknown): FormError | null {
  if (authError || !user || !user.id) {
    return {
      type: "session_expired",
      message: "Your session has expired or you are not signed in. Please sign in again to add items to your closet.",
    };
  }
  return null;
}

export function resolveStorageError(uploadError: {
  message?: string;
  statusCode?: string | number;
  status?: number;
} | null): FormError | null {
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

  if (isBucketNotFound) {
    return {
      type: "storage_rejected",
      message: "The 'wardrobe' storage bucket was not found in Supabase. Please ensure a public bucket named 'wardrobe' is created in the Supabase Dashboard.",
    };
  }

  if (isPermissionDenied) {
    return {
      type: "storage_rejected",
      message: "Storage upload rejected: Permission denied. Please ensure the storage RLS policy allows authenticated uploads into the 'wardrobe' bucket.",
    };
  }

  return {
    type: "storage_rejected",
    message: `Storage upload failed: ${errorMsg}. Please check bucket permissions or try a different image.`,
  };
}

export function resolveDatabaseError(dbError: {
  code?: string;
  message?: string;
} | null): FormError | null {
  if (!dbError) return null;

  const dbMsg = dbError.message || "";
  const isRlsViolation =
    dbError.code === "42501" ||
    dbMsg.toLowerCase().includes("row-level security") ||
    dbMsg.toLowerCase().includes("policy") ||
    dbMsg.toLowerCase().includes("permission denied");

  if (isRlsViolation) {
    return {
      type: "rls_violation",
      message: "Database insert failed: Row-Level Security (RLS) violation. Ensure you are authenticated and migration 20261012000001_rls_insert_policy.sql is applied in Supabase.",
    };
  }

  if (dbError.code === "23503") {
    return {
      type: "generic",
      message: "Database foreign key error: User profile not recognized in authentication records. Please sign out and sign back in.",
    };
  }

  return {
    type: "generic",
    message: `Database insert failed: ${dbMsg}`,
  };
}
