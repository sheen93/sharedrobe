#!/usr/bin/env node

/**
 * ==============================================================================
 * QA Advocate Test Suite: Closet Upload Edge Cases & Failure Scenarios
 * ==============================================================================
 * Validates that exact, human-readable error messages are surfaced for:
 * 1. File/Data Missing:
 *    - 1A: User submits without selecting a photo
 *    - 1B: User submits without entering an item title
 *    - 1C: User submits with an invalid category not matching the Postgres enum
 * 2. Session Expiration:
 *    - 2A: User token expired / user object missing
 *    - 2B: Auth error returned by Supabase auth.getUser()
 * 3. Storage Rejection:
 *    - 3A: 'wardrobe' bucket does not exist (404)
 *    - 3B: Storage RLS permission denied (403)
 *    - 3C: File payload too large (413)
 *    - 3D: Network connection failure during storage upload
 * 4. Database Rejection:
 *    - 4A: Postgres ENUM constraint failure (Code 22P02, invalid input value for enum item_category)
 *    - 4B: Row-Level Security violation (Code 42501, RLS policy blocks insert)
 *    - 4C: Foreign key violation (Code 23503)
 *    - 4D: Generic unexpected database error
 *
 * MANUAL UI TEST PROTOCOL:
 * ------------------------------------------------------------------------------
 * Test 1 (Missing file): Open Add Item modal, enter title, click 'Save' without photo.
 *         Expected UI: Red border around photo area + alert banner requesting photo.
 * Test 2 (Missing title): Select photo, leave title blank, click 'Save'.
 *         Expected UI: Red border around title input + alert banner requesting name.
 * Test 3 (Session expiration): Open modal, clear Supabase cookies in DevTools, click 'Save'.
 *         Expected UI: Alert banner stating session expired + 'Sign In to Continue' button.
 * Test 4 (Invalid Category / ENUM check): Verify dropdown options all submit plural values:
 *         ['Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Shoes', 'Bags', 'Accessories'].
 * Test 5 (Storage rejection / 404): Simulate bucket missing by renaming bucket.
 *         Expected UI: Actionable guidance instructing to create public bucket 'wardrobe'.
 * Test 6 (RLS rejection / 42501): Simulate unauthenticated / wrong user insert.
 *         Expected UI: Clear explanation of RLS failure and migration reference.
 * ==============================================================================
 */

import assert from "node:assert/strict";

const VALID_ENUM_CATEGORIES = [
  "Tops",
  "Bottoms",
  "Dresses",
  "Outerwear",
  "Shoes",
  "Bags",
  "Accessories",
];

function isValidCategory(category) {
  return VALID_ENUM_CATEGORIES.includes(category);
}

function validateUploadInputs(file, title, category) {
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

function resolveSessionError(user, authError) {
  if (authError || !user || !user.id) {
    return {
      type: "session_expired",
      message:
        "Your session has expired or you are not signed in. Please sign in again to add items to your closet.",
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

function resolveDatabaseError(dbError) {
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

// ------------------------------------------------------------------------------
// Category ENUM Integrity Check
// ------------------------------------------------------------------------------
runTest("Integrity: All 7 required Postgres ENUM categories are present", () => {
  const expected = ["Tops", "Bottoms", "Dresses", "Outerwear", "Shoes", "Bags", "Accessories"];
  assert.deepEqual(VALID_ENUM_CATEGORIES, expected);
});

// ------------------------------------------------------------------------------
// Scenario 1: File/Data Missing
// ------------------------------------------------------------------------------
runTest("Scenario 1A: Fails gracefully when no file is selected", () => {
  const result = validateUploadInputs(null, "Linen Summer Dress", "Tops");
  assert.notEqual(result, null);
  assert.equal(result.type, "no_file");
  assert.match(result.message, /select or capture a photo/i);
});

runTest("Scenario 1B: Fails gracefully when no title is entered", () => {
  const dummyFile = { name: "dress.jpg" };
  const result = validateUploadInputs(dummyFile, "   ", "Dresses");
  assert.notEqual(result, null);
  assert.equal(result.type, "no_title");
  assert.match(result.message, /enter a descriptive item name/i);
});

runTest("Scenario 1C: Fails gracefully when an invalid singular category is submitted", () => {
  const dummyFile = { name: "shirt.jpg" };
  const result = validateUploadInputs(dummyFile, "Vintage Shirt", "Top"); // singular "Top" instead of "Tops"
  assert.notEqual(result, null);
  assert.equal(result.type, "enum_violation");
  assert.match(result.message, /Invalid clothing category 'Top'/i);
});

// ------------------------------------------------------------------------------
// Scenario 2: Session Expiration
// ------------------------------------------------------------------------------
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

// ------------------------------------------------------------------------------
// Scenario 3: Storage Rejection
// ------------------------------------------------------------------------------
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

runTest("Scenario 3C: File too large / payload exceeds limit (413)", () => {
  const storageError = { message: "Payload too large", statusCode: 413 };
  const result = resolveStorageError(storageError);
  assert.notEqual(result, null);
  assert.equal(result.type, "storage_rejected");
  assert.match(result.message, /exceeds the maximum storage upload limit/i);
});

runTest("Scenario 3D: Network connection failed during upload", () => {
  const storageError = { message: "Failed to fetch: network error" };
  const result = resolveStorageError(storageError);
  assert.notEqual(result, null);
  assert.equal(result.type, "storage_rejected");
  assert.match(result.message, /network connection failed/i);
});

// ------------------------------------------------------------------------------
// Scenario 4: Database Rejection
// ------------------------------------------------------------------------------
runTest("Scenario 4A: Postgres ENUM constraint failure (Code 22P02)", () => {
  const dbError = {
    code: "22P02",
    message: 'invalid input value for enum item_category: "Top"',
  };
  const result = resolveDatabaseError(dbError);
  assert.notEqual(result, null);
  assert.equal(result.type, "enum_violation");
  assert.match(result.message, /Invalid category value for Postgres enum 'item_category'/i);
  assert.match(result.message, /Tops, Bottoms, Dresses/i);
});

runTest("Scenario 4B: DB insert RLS violation (Code 42501)", () => {
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

runTest("Scenario 4C: DB insert foreign key error (Code 23503)", () => {
  const dbError = {
    code: "23503",
    message: "insert or update on table items violates foreign key constraint",
  };
  const result = resolveDatabaseError(dbError);
  assert.notEqual(result, null);
  assert.equal(result.type, "generic");
  assert.match(result.message, /user profile not recognized/i);
});

runTest("Scenario 4D: Generic database insert error", () => {
  const dbError = {
    code: "40001",
    message: "serialization failure",
  };
  const result = resolveDatabaseError(dbError);
  assert.notEqual(result, null);
  assert.equal(result.type, "generic");
  assert.match(result.message, /Database insert failed: serialization failure/i);
});

console.log("==================================================");
console.log(`🎉 All ${totalPassed} QA edge case test scenarios PASSED!`);
console.log("==================================================");
