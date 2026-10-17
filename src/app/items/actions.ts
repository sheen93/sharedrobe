"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

import {
  type ActionResult,
  isValidUuid,
  ALLOWED_ITEM_STATUSES,
  type ItemStatus,
  ALLOWED_ITEM_TAGS,
  extractStoragePath,
} from "./constants";

/**
 * Updates the lending status of an item.
 * If status is 'Lent Out', optionally records the borrower (must be an accepted friend).
 * If status is 'Available' or 'In Laundry', automatically clears borrowed_by to null.
 * Strictly verifies that the authenticated user is the owner of the garment.
 */
export async function updateItemStatus(
  itemId: string,
  status: ItemStatus,
  borrowedById?: string | null
): Promise<ActionResult<{ status: ItemStatus; borrowedBy: string | null }>> {
  if (!isValidUuid(itemId)) {
    return { success: false, error: "Invalid item ID provided." };
  }

  if (!ALLOWED_ITEM_STATUSES.includes(status)) {
    return {
      success: false,
      error: `Invalid status. Must be one of: ${ALLOWED_ITEM_STATUSES.join(", ")}.`,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required to update item status." };
  }

  // 1. Verify item exists and belongs to the authenticated user
  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("id, owner_id, title")
    .eq("id", itemId)
    .maybeSingle();

  if (itemErr || !item) {
    return { success: false, error: "Garment not found." };
  }

  if (item.owner_id !== user.id) {
    return {
      success: false,
      error: "Unauthorized: You can only change the status of garments in your own wardrobe.",
    };
  }

  // 2. Validate borrower if status is 'Lent Out'
  let targetBorrowerId: string | null = null;
  if (status === "Lent Out" && borrowedById) {
    if (!isValidUuid(borrowedById)) {
      return { success: false, error: "Invalid borrower user ID." };
    }

    if (borrowedById === user.id) {
      return {
        success: false,
        error: "You cannot mark an item as lent out to yourself.",
      };
    }

    // Verify borrower is an accepted friend
    const { data: friendship, error: friendErr } = await supabase
      .from("friendships")
      .select("id")
      .eq("status", "accepted")
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${borrowedById}),and(addressee_id.eq.${user.id},requester_id.eq.${borrowedById})`
      )
      .maybeSingle();

    if (friendErr || !friendship) {
      return {
        success: false,
        error: "Borrower must be a connected friend in your network.",
      };
    }

    targetBorrowerId = borrowedById;
  }

  // 3. Update status and borrowed_by in database
  const { error: updateErr } = await supabase
    .from("items")
    .update({
      status,
      borrowed_by: targetBorrowerId,
    })
    .eq("id", itemId)
    .eq("owner_id", user.id);

  if (updateErr) {
    return { success: false, error: updateErr.message || "Failed to update item status." };
  }

  revalidatePath(`/items/${itemId}`);
  revalidatePath("/");
  revalidatePath("/sharedrobe");

  return {
    success: true,
    message: `Status updated to "${status}".`,
    data: { status, borrowedBy: targetBorrowerId },
  };
}

/**
 * Updates the category tags for a garment.
 * Enforces the Postgres CHECK constraint: values must be in ALLOWED_ITEM_TAGS.
 * Strictly verifies that the authenticated user owns the garment.
 */
export async function updateItemTags(
  itemId: string,
  tags: string[]
): Promise<ActionResult<{ tags: string[] }>> {
  if (!isValidUuid(itemId)) {
    return { success: false, error: "Invalid item ID provided." };
  }

  if (!Array.isArray(tags)) {
    return { success: false, error: "Tags must be provided as an array." };
  }

  // Validate tags against allowed list
  const allowedSet = new Set<string>(ALLOWED_ITEM_TAGS);
  const validatedTags: string[] = [];

  for (const tag of tags) {
    if (typeof tag === "string") {
      const trimmed = tag.trim();
      if (!allowedSet.has(trimmed)) {
        return {
          success: false,
          error: `Invalid tag "${trimmed}". Allowed tags: ${ALLOWED_ITEM_TAGS.join(", ")}.`,
        };
      }
      if (!validatedTags.includes(trimmed)) {
        validatedTags.push(trimmed);
      }
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required to update tags." };
  }

  // Verify ownership
  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("id, owner_id")
    .eq("id", itemId)
    .maybeSingle();

  if (itemErr || !item) {
    return { success: false, error: "Garment not found." };
  }

  if (item.owner_id !== user.id) {
    return {
      success: false,
      error: "Unauthorized: You can only edit tags on your own garments.",
    };
  }

  const { error: updateErr } = await supabase
    .from("items")
    .update({ tags: validatedTags })
    .eq("id", itemId)
    .eq("owner_id", user.id);

  if (updateErr) {
    return { success: false, error: updateErr.message || "Failed to update garment tags." };
  }

  revalidatePath(`/items/${itemId}`);
  revalidatePath("/");

  return {
    success: true,
    message: "Garment tags updated successfully.",
    data: { tags: validatedTags },
  };
}

/**
 * Deletes a garment from the user's wardrobe.
 * CRITICAL WORKFLOW:
 * 1. Validates auth.uid() = owner_id.
 * 2. Extracts storage file path from imageUrl (or database item record).
 * 3. Deletes image from the Supabase 'wardrobe' storage bucket.
 * 4. Deletes the Postgres row from public.items.
 */
export async function deleteItem(
  itemId: string,
  imageUrl?: string
): Promise<ActionResult<{ deletedId: string }>> {
  if (!isValidUuid(itemId)) {
    return { success: false, error: "Invalid item ID provided." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required to delete garments." };
  }

  // 1. Fetch item from database and verify ownership
  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("id, owner_id, title, image_url")
    .eq("id", itemId)
    .maybeSingle();

  if (itemErr || !item) {
    return { success: false, error: "Garment could not be found." };
  }

  if (item.owner_id !== user.id) {
    return {
      success: false,
      error: "Unauthorized: You do not have permission to delete this garment.",
    };
  }

  // 2. Extract storage file path
  const targetImageUrl = imageUrl || item.image_url;
  const storageFilePath = extractStoragePath(targetImageUrl, "wardrobe");

  // 3. Delete from Supabase Storage bucket ('wardrobe')
  if (storageFilePath) {
    // Security check: ensure path belongs to user's folder
    if (storageFilePath.startsWith(`${user.id}/`)) {
      try {
        const { error: storageErr } = await supabase.storage
          .from("wardrobe")
          .remove([storageFilePath]);

        if (storageErr) {
          console.warn("[Storage Warning] Could not remove file:", storageErr.message);
        }
      } catch (err) {
        console.warn("[Storage Exception] Error during image deletion:", err);
      }
    } else {
      console.warn(
        `[Storage Security] Storage path ${storageFilePath} does not match user folder ${user.id}`
      );
    }
  }

  // 4. Delete Postgres row
  const { error: dbErr } = await supabase
    .from("items")
    .delete()
    .eq("id", itemId)
    .eq("owner_id", user.id);

  if (dbErr) {
    return {
      success: false,
      error: dbErr.message || "Failed to delete garment from database.",
    };
  }

  revalidatePath("/");
  revalidatePath("/sharedrobe");

  return {
    success: true,
    message: `"${item.title}" was successfully deleted from your wardrobe.`,
    data: { deletedId: itemId },
  };
}
