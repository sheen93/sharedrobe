#!/usr/bin/env node

/**
 * QA Advocate Test Suite: Closet Upload Edge Cases & Failure Scenarios
 * Verifies that human-readable error messages are properly returned for:
 * 1. Missing file / missing title
 * 2. Session expired / unauthenticated user
 * 3. Storage bucket rejection (404 missing bucket, 403 permission denied)
 * 4. Database RLS violation (42501 permission denied)
 */

import assert from "node:assert/strict";

// Core logic mirrored from src/utils/upload-errors.ts
function validateUploadInputs(file, title) {
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

function resolveSessionError(user, authError) {
  if (authError || !user || !user.id) {
    return {
      type: "session_expired",
      message: "Your session has expired or you are not signed in. Please sign in again to add items to your closet.",
    };
  }
  return null;
}

function resolveStorageError(uploadError) {
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

function resolveDatabaseError(dbError) {
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

console.log("==================================================");
console.log("  QA Advocate: Upload Edge Cases & Error Verification");
console.log("==================================================");

let totalPassed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    totalPassed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// 1. Scenario: User attempts upload without selecting a file
runTest("Scenario 1A: Fails gracefully when no file is selected", () => {
  const result = validateUploadInputs(null, "Linen Summer Dress");
  assert.notEqual(result, null);
  assert.equal(result.type, "no_file");
  assert.match(result.message, /select or capture a photo/i);
});

runTest("Scenario 1B: Fails gracefully when no title is entered", () => {
  const dummyFile = { name: "dress.jpg" };
  const result = validateUploadInputs(dummyFile, "   ");
  assert.notEqual(result, null);
  assert.equal(result.type, "no_title");
  assert.match(result.message, /enter a descriptive item name/i);
});

// 2. Scenario: User session expires mid-upload
runTest("Scenario 2A: Session expired / user missing", () => {
  const result = resolveSessionError(null, null);
  assert.notEqual(result, null);
  assert.equal(result.type, "session_expired");
  assert.match(result.message, /session has expired.*sign in again/i);
});

runTest("Scenario 2B: Auth error returned by Supabase auth.getUser()", () => {
  const result = resolveSessionError({ id: "user-123" }, new Error("JWT expired"));
  assert.notEqual(result, null);
  assert.equal(result.type, "session_expired");
  assert.match(result.message, /session has expired.*sign in again/i);
});

// 3. Scenario: Storage bucket rejects the file
runTest("Scenario 3A: Storage bucket missing (404)", () => {
  const storageError = { message: "The resource was not found", statusCode: 404 };
  const result = resolveStorageError(storageError);
  assert.notEqual(result, null);
  assert.equal(result.type, "storage_rejected");
  assert.match(result.message, /bucket was not found.*wardrobe/i);
});

runTest("Scenario 3B: Storage bucket permission denied (403)", () => {
  const storageError = { message: "row-level security policy violation", statusCode: 403 };
  const result = resolveStorageError(storageError);
  assert.notEqual(result, null);
  assert.equal(result.type, "storage_rejected");
  assert.match(result.message, /permission denied.*wardrobe/i);
});

// 4. Scenario: Database insert fails due to RLS violation
runTest("Scenario 4A: DB insert RLS violation (Code 42501)", () => {
  const dbError = {
    code: "42501",
    message: "new row violates row-level security policy for table items",
  };
  const result = resolveDatabaseError(dbError);
  assert.notEqual(result, null);
  assert.equal(result.type, "rls_violation");
  assert.match(result.message, /Row-Level Security \(RLS\) violation/i);
  assert.match(result.message, /20261012000001_rls_insert_policy\.sql/i);
});

runTest("Scenario 4B: DB insert foreign key error (Code 23503)", () => {
  const dbError = {
    code: "23503",
    message: "insert or update on table items violates foreign key constraint",
  };
  const result = resolveDatabaseError(dbError);
  assert.notEqual(result, null);
  assert.equal(result.type, "generic");
  assert.match(result.message, /user profile not recognized/i);
});

console.log("==================================================");
console.log(`🎉 All ${totalPassed} QA edge case test scenarios PASSED!`);
console.log("==================================================");
