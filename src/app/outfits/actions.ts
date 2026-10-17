"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { sendBorrowRequestEmail } from "@/utils/email/resend";
import { isValidBorrowDuration } from "@/app/sharedrobe/constants";
import {
  deduplicateItemIds,
  filterNonOwnedOutfitItems,
  formatSharedOutfitMessage,
  isValidOutfitTitle,
  isValidOutfitVisibility,
  isValidOutfitVote,
  isValidUuid,
  MAX_OUTFIT_ITEMS,
  MAX_OUTFIT_TITLE_LENGTH,
  MIN_OUTFIT_ITEMS,
  MIN_OUTFIT_TITLE_LENGTH,
  type OutfitVisibility,
  type OutfitVoteType,
} from "./constants";

export interface OutfitActionResult {
  success: boolean;
  message?: string;
  error?: string;
  outfitId?: string;
  requestedCount?: number;
}

/**
 * 1. Creates a new Lookbook Outfit and batch-inserts its constituent items into outfit_items.
 *    If visibility is 'circle_public', also logs a 'shared_outfit' card to circle_activity.
 */
export async function createOutfit(
  title: string,
  itemIds: string[],
  circleId?: string | null,
  visibility: OutfitVisibility = "private"
): Promise<OutfitActionResult> {
  const trimmedTitle = typeof title === "string" ? title.trim() : "";
  if (!isValidOutfitTitle(trimmedTitle)) {
    return {
      success: false,
      error: `Lookbook title must be between ${MIN_OUTFIT_TITLE_LENGTH} and ${MAX_OUTFIT_TITLE_LENGTH} characters.`,
    };
  }

  if (!Array.isArray(itemIds) || itemIds.length < MIN_OUTFIT_ITEMS) {
    return {
      success: false,
      error: "Please select at least 1 garment to build your lookbook.",
    };
  }

  if (itemIds.some((id) => !isValidUuid(id))) {
    return {
      success: false,
      error: "One or more selected garment IDs are invalid.",
    };
  }

  const uniqueItemIds = deduplicateItemIds(itemIds);
  if (uniqueItemIds.length < MIN_OUTFIT_ITEMS) {
    return {
      success: false,
      error: "Please select at least 1 valid garment for your lookbook.",
    };
  }

  if (uniqueItemIds.length > MAX_OUTFIT_ITEMS) {
    return {
      success: false,
      error: `A lookbook can contain at most ${MAX_OUTFIT_ITEMS} garments.`,
    };
  }

  if (!isValidOutfitVisibility(visibility)) {
    return {
      success: false,
      error: "Invalid outfit visibility. Choose 'private' or 'circle_public'.",
    };
  }

  const trimmedCircleId =
    typeof circleId === "string" && circleId.trim().length > 0
      ? circleId.trim()
      : null;

  if (visibility === "circle_public" && !trimmedCircleId) {
    return {
      success: false,
      error: "Please choose a circle to share your lookbook for Yay/Nay voting.",
    };
  }

  if (trimmedCircleId && !isValidUuid(trimmedCircleId)) {
    return {
      success: false,
      error: "Invalid circle ID selected.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      success: false,
      error: "Your session has expired. Please sign in again.",
    };
  }

  // If linked to a circle, verify the user is an approved member of that circle
  if (trimmedCircleId) {
    const { data: membership, error: memberError } = await supabase
      .from("circle_members")
      .select("role, status")
      .eq("circle_id", trimmedCircleId)
      .eq("user_id", user.id)
      .eq("status", "approved")
      .maybeSingle();

    if (memberError || !membership) {
      return {
        success: false,
        error: "You must be an approved member of the selected circle to share a lookbook there.",
      };
    }
  }

  // Verify all selected items exist and are accessible to the user
  const { data: accessibleItems, error: itemsError } = await supabase
    .from("items")
    .select("id")
    .in("id", uniqueItemIds);

  if (itemsError) {
    return {
      success: false,
      error: "Unable to verify selected garments. Please try again.",
    };
  }

  const foundIds = new Set((accessibleItems ?? []).map((item) => item.id));
  if (foundIds.size !== uniqueItemIds.length) {
    return {
      success: false,
      error: "One or more selected garments could not be found or are no longer accessible.",
    };
  }

  // Insert the outfit record
  const { data: createdOutfit, error: outfitInsertError } = await supabase
    .from("outfits")
    .insert({
      creator_id: user.id,
      circle_id: trimmedCircleId,
      title: trimmedTitle,
      visibility,
    })
    .select("id, title, circle_id, visibility")
    .single();

  if (outfitInsertError || !createdOutfit) {
    console.error("[createOutfit] Insert outfit error:", outfitInsertError);
    return {
      success: false,
      error: "Could not save your lookbook. Please try again.",
    };
  }

  // Batch insert outfit_items
  const outfitItemRows = uniqueItemIds.map((itemId) => ({
    outfit_id: createdOutfit.id,
    item_id: itemId,
  }));

  const { error: batchItemsError } = await supabase
    .from("outfit_items")
    .insert(outfitItemRows);

  if (batchItemsError) {
    console.error("[createOutfit] Batch insert outfit_items error:", batchItemsError);
    // Clean up orphaned outfit row
    await supabase.from("outfits").delete().eq("id", createdOutfit.id);
    return {
      success: false,
      error: "Could not attach garments to your lookbook. Please try again.",
    };
  }

  // If shared to a circle for Yay/Nay, log a 'shared_outfit' event into circle_activity
  if (visibility === "circle_public" && trimmedCircleId) {
    const { data: creatorProfile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle();

    const creatorName =
      creatorProfile?.full_name ||
      creatorProfile?.email?.split("@")[0] ||
      "A circle friend";

    const activityMessage = formatSharedOutfitMessage(
      creatorName,
      trimmedTitle,
      uniqueItemIds.length
    );

    const { error: activityError } = await supabase
      .from("circle_activity")
      .insert({
        circle_id: trimmedCircleId,
        actor_id: user.id,
        action_type: "shared_outfit",
        target_outfit_id: createdOutfit.id,
        message: activityMessage,
      });

    if (activityError) {
      console.warn(
        "[createOutfit] Non-fatal circle_activity insert warning:",
        activityError
      );
    }
  }

  revalidatePath("/outfits/builder");
  revalidatePath("/sharedrobe");
  revalidatePath("/");
  if (trimmedCircleId) {
    revalidatePath(`/sharedrobe/${trimmedCircleId}`);
  }

  return {
    success: true,
    outfitId: createdOutfit.id,
    message:
      visibility === "circle_public"
        ? `Lookbook "${trimmedTitle}" is live in the Circle Drama Feed for Yay/Nay voting! ✨`
        : `Lookbook "${trimmedTitle}" saved to your private collection! 🔒`,
  };
}

/**
 * 2. Toggles an outfit's visibility between 'private' and 'circle_public'.
 */
export async function toggleOutfitVisibility(
  outfitId: string,
  visibility: OutfitVisibility,
  circleId?: string | null
): Promise<OutfitActionResult> {
  if (!isValidUuid(outfitId)) {
    return { success: false, error: "Invalid lookbook ID." };
  }

  if (!isValidOutfitVisibility(visibility)) {
    return {
      success: false,
      error: "Invalid visibility option. Choose 'private' or 'circle_public'.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      success: false,
      error: "Your session has expired. Please sign in again.",
    };
  }

  const trimmedOutfitId = outfitId.trim();

  const { data: outfit, error: outfitError } = await supabase
    .from("outfits")
    .select("id, creator_id, circle_id, title, visibility")
    .eq("id", trimmedOutfitId)
    .maybeSingle();

  if (outfitError || !outfit) {
    return {
      success: false,
      error: "Lookbook not found.",
    };
  }

  if (outfit.creator_id !== user.id) {
    return {
      success: false,
      error: "Only the lookbook creator can change its visibility.",
    };
  }

  const resolvedCircleId =
    typeof circleId === "string" && circleId.trim().length > 0
      ? circleId.trim()
      : outfit.circle_id;

  if (visibility === "circle_public") {
    if (!resolvedCircleId || !isValidUuid(resolvedCircleId)) {
      return {
        success: false,
        error: "A valid circle is required to make a lookbook public for Yay/Nay voting.",
      };
    }

    const { data: membership, error: memberError } = await supabase
      .from("circle_members")
      .select("status")
      .eq("circle_id", resolvedCircleId)
      .eq("user_id", user.id)
      .eq("status", "approved")
      .maybeSingle();

    if (memberError || !membership) {
      return {
        success: false,
        error: "You must be an approved member of the circle to share this lookbook.",
      };
    }
  }

  const { error: updateError } = await supabase
    .from("outfits")
    .update({
      visibility,
      circle_id: resolvedCircleId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", trimmedOutfitId)
    .eq("creator_id", user.id);

  if (updateError) {
    console.error("[toggleOutfitVisibility] Update error:", updateError);
    return {
      success: false,
      error: "Could not update lookbook visibility. Please try again.",
    };
  }

  // Ensure a 'shared_outfit' activity card exists when made circle_public
  if (visibility === "circle_public" && resolvedCircleId) {
    const { data: existingActivity } = await supabase
      .from("circle_activity")
      .select("id")
      .eq("circle_id", resolvedCircleId)
      .eq("target_outfit_id", trimmedOutfitId)
      .eq("action_type", "shared_outfit")
      .maybeSingle();

    if (!existingActivity) {
      const [{ data: creatorProfile }, { count: itemCount }] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("outfit_items")
          .select("id", { count: "exact", head: true })
          .eq("outfit_id", trimmedOutfitId),
      ]);

      const creatorName =
        creatorProfile?.full_name ||
        creatorProfile?.email?.split("@")[0] ||
        "A circle friend";

      await supabase.from("circle_activity").insert({
        circle_id: resolvedCircleId,
        actor_id: user.id,
        action_type: "shared_outfit",
        target_outfit_id: trimmedOutfitId,
        message: formatSharedOutfitMessage(
          creatorName,
          outfit.title,
          itemCount ?? 1
        ),
      });
    }
  }

  revalidatePath("/outfits/builder");
  revalidatePath("/sharedrobe");
  if (resolvedCircleId) {
    revalidatePath(`/sharedrobe/${resolvedCircleId}`);
  }

  return {
    success: true,
    outfitId: trimmedOutfitId,
    message:
      visibility === "circle_public"
        ? `Lookbook "${outfit.title}" is now shared with your circle for Yay/Nay voting! ✨`
        : `Lookbook "${outfit.title}" is now private. 🔒`,
  };
}

/**
 * 3. Upserts a 'yay' or 'nay' vote into outfit_votes for a circle_public outfit.
 */
export async function castOutfitVote(
  outfitId: string,
  vote: OutfitVoteType
): Promise<OutfitActionResult> {
  if (!isValidUuid(outfitId)) {
    return { success: false, error: "Invalid lookbook ID." };
  }

  if (!isValidOutfitVote(vote)) {
    return {
      success: false,
      error: "Invalid vote option. Choose 'yay' or 'nay'.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      success: false,
      error: "Your session has expired. Please sign in again.",
    };
  }

  const trimmedOutfitId = outfitId.trim();
  const normalizedVote = vote.trim() as OutfitVoteType;

  const { data: outfit, error: outfitError } = await supabase
    .from("outfits")
    .select("id, creator_id, circle_id, title, visibility")
    .eq("id", trimmedOutfitId)
    .maybeSingle();

  if (outfitError || !outfit) {
    return {
      success: false,
      error: "Lookbook not found or no longer shared.",
    };
  }

  if (outfit.visibility !== "circle_public" || !outfit.circle_id) {
    return {
      success: false,
      error: "Voting is only enabled on lookbooks shared with a circle.",
    };
  }

  const { data: membership, error: memberError } = await supabase
    .from("circle_members")
    .select("status")
    .eq("circle_id", outfit.circle_id)
    .eq("user_id", user.id)
    .eq("status", "approved")
    .maybeSingle();

  if (memberError || !membership) {
    return {
      success: false,
      error: "Only approved members of this circle can vote on this lookbook.",
    };
  }

  const { error: upsertError } = await supabase
    .from("outfit_votes")
    .upsert(
      {
        outfit_id: trimmedOutfitId,
        voter_id: user.id,
        vote: normalizedVote,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "outfit_id,voter_id" }
    );

  if (upsertError) {
    console.error("[castOutfitVote] Upsert error:", upsertError);
    return {
      success: false,
      error: "Could not record your vote. Please try again.",
    };
  }

  revalidatePath(`/sharedrobe/${outfit.circle_id}`);
  revalidatePath("/sharedrobe");
  revalidatePath("/outfits/builder");

  return {
    success: true,
    outfitId: trimmedOutfitId,
    message:
      normalizedVote === "yay"
        ? `You voted 👍 Yay on "${outfit.title}"!`
        : `You voted 👎 Nay on "${outfit.title}"!`,
  };
}

/**
 * 4. Identifies all items in an outfit not owned by auth.uid(), creates a borrow_request
 *    for each item's owner using the single durationIntent, and triggers Resend notification
 *    emails for each owner inside defensive error boundaries.
 */
export async function batchBorrowOutfitItems(
  outfitId: string,
  durationIntent: string
): Promise<OutfitActionResult> {
  if (!isValidUuid(outfitId)) {
    return { success: false, error: "Invalid lookbook ID." };
  }

  if (!isValidBorrowDuration(durationIntent)) {
    return {
      success: false,
      error: "Please choose one of the 4 borrow duration options.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      success: false,
      error: "Your session has expired. Please sign in again.",
    };
  }

  const trimmedOutfitId = outfitId.trim();
  const trimmedDuration = durationIntent.trim();

  // Fetch the outfit metadata
  const { data: outfit, error: outfitError } = await supabase
    .from("outfits")
    .select("id, creator_id, circle_id, title, visibility")
    .eq("id", trimmedOutfitId)
    .maybeSingle();

  if (outfitError || !outfit) {
    return {
      success: false,
      error: "Lookbook not found or you do not have access to it.",
    };
  }

  // Fetch all items in the outfit
  const { data: outfitItemRows, error: outfitItemsError } = await supabase
    .from("outfit_items")
    .select(
      `
      item_id,
      items:item_id (
        id,
        title,
        owner_id,
        status
      )
    `
    )
    .eq("outfit_id", trimmedOutfitId);

  if (outfitItemsError || !outfitItemRows || outfitItemRows.length === 0) {
    return {
      success: false,
      error: "No garments found in this lookbook.",
    };
  }

  interface HydratedOutfitGarment {
    id: string;
    title: string;
    owner_id: string;
    status: string;
  }

  const rawGarments: HydratedOutfitGarment[] = [];
  for (const row of outfitItemRows) {
    const itemObj = Array.isArray(row.items) ? row.items[0] : row.items;
    if (itemObj && itemObj.id && itemObj.owner_id) {
      rawGarments.push({
        id: itemObj.id,
        title: itemObj.title ?? "Untitled Piece",
        owner_id: itemObj.owner_id,
        status: itemObj.status ?? "Available",
      });
    }
  }

  // Filter to only items NOT owned by auth.uid()
  const nonOwnedItems = filterNonOwnedOutfitItems(rawGarments, user.id);

  if (nonOwnedItems.length === 0) {
    return {
      success: false,
      error: "You already own all the pieces in this lookbook!",
    };
  }

  // Filter to items that are currently 'Available'
  const availableNonOwnedItems = nonOwnedItems.filter(
    (item) => item.status === "Available"
  );

  if (availableNonOwnedItems.length === 0) {
    return {
      success: false,
      error:
        "The remaining non-owned pieces in this lookbook are currently lent out or in the laundry.",
    };
  }

  // Determine the user's approved circles so we can associate each borrow_request with a valid circle_id
  const { data: userMemberships } = await supabase
    .from("circle_members")
    .select("circle_id")
    .eq("user_id", user.id)
    .eq("status", "approved");

  const approvedCircleIdSet = new Set(
    (userMemberships ?? []).map((m) => m.circle_id)
  );

  if (approvedCircleIdSet.size === 0) {
    return {
      success: false,
      error: "You must be an approved member of a circle to borrow garments.",
    };
  }

  const targetItemIds = availableNonOwnedItems.map((item) => item.id);

  // Check if any of these items already have a pending request from this user
  const { data: existingPendingRequests } = await supabase
    .from("borrow_requests")
    .select("item_id")
    .eq("requester_id", user.id)
    .eq("status", "pending")
    .in("item_id", targetItemIds);

  const alreadyPendingItemIds = new Set(
    (existingPendingRequests ?? []).map((r) => r.item_id)
  );

  const itemsNeedingRequest = availableNonOwnedItems.filter(
    (item) => !alreadyPendingItemIds.has(item.id)
  );

  if (itemsNeedingRequest.length === 0) {
    return {
      success: false,
      error:
        "You already have pending borrow requests for all available pieces in this lookbook!",
    };
  }

  // Map each item to its circle_id (prefer outfit.circle_id if user is a member; otherwise lookup from circle_items)
  const { data: circleItemLinks } = await supabase
    .from("circle_items")
    .select("item_id, circle_id")
    .in(
      "item_id",
      itemsNeedingRequest.map((item) => item.id)
    );

  const itemToCircleMap = new Map<string, string>();
  for (const link of circleItemLinks ?? []) {
    if (approvedCircleIdSet.has(link.circle_id) && !itemToCircleMap.has(link.item_id)) {
      itemToCircleMap.set(link.item_id, link.circle_id);
    }
  }

  const defaultCircleId =
    outfit.circle_id && approvedCircleIdSet.has(outfit.circle_id)
      ? outfit.circle_id
      : null;

  const insertPayload: {
    item_id: string;
    requester_id: string;
    circle_id: string;
    status: "pending";
    duration_intent: string;
  }[] = [];

  const requestItemsMeta: {
    item: HydratedOutfitGarment;
    circleId: string;
  }[] = [];

  for (const item of itemsNeedingRequest) {
    const resolvedCircleId = defaultCircleId ?? itemToCircleMap.get(item.id);
    if (resolvedCircleId) {
      insertPayload.push({
        item_id: item.id,
        requester_id: user.id,
        circle_id: resolvedCircleId,
        status: "pending",
        duration_intent: trimmedDuration,
      });
      requestItemsMeta.push({ item, circleId: resolvedCircleId });
    }
  }

  if (insertPayload.length === 0) {
    return {
      success: false,
      error: "Could not find a shared circle for the remaining items in this lookbook.",
    };
  }

  const { error: batchInsertError } = await supabase
    .from("borrow_requests")
    .insert(insertPayload);

  if (batchInsertError) {
    console.error("[batchBorrowOutfitItems] Insert error:", batchInsertError);
    return {
      success: false,
      error: "Could not submit batch borrow requests. Please try again.",
    };
  }

  // Fetch owner profiles, requester profile, and circle names for Resend notification emails
  const distinctOwnerIds = Array.from(
    new Set(requestItemsMeta.map((m) => m.item.owner_id))
  );
  const distinctCircleIds = Array.from(
    new Set(requestItemsMeta.map((m) => m.circleId))
  );

  const [{ data: ownerProfiles }, { data: requesterProfile }, { data: circleRows }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", distinctOwnerIds),
      supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("circles")
        .select("id, name")
        .in("id", distinctCircleIds),
    ]);

  const ownerProfileMap = new Map(
    (ownerProfiles ?? []).map((p) => [p.id, p])
  );
  const circleNameMap = new Map(
    (circleRows ?? []).map((c) => [c.id, c.name])
  );

  const requesterName =
    requesterProfile?.full_name ||
    requesterProfile?.email?.split("@")[0] ||
    user.email?.split("@")[0] ||
    "A circle friend";

  // Trigger Resend emails concurrently inside defensive error boundaries
  await Promise.allSettled(
    requestItemsMeta.map(async ({ item, circleId }) => {
      const ownerProfile = ownerProfileMap.get(item.owner_id);
      if (!ownerProfile?.email) return;

      const ownerName =
        ownerProfile.full_name ||
        ownerProfile.email.split("@")[0] ||
        "Closet Owner";
      const circleName = circleNameMap.get(circleId) || "your circle";

      await sendBorrowRequestEmail({
        ownerEmail: ownerProfile.email,
        ownerName,
        requesterName,
        itemTitle: item.title,
        circleName,
        durationIntent: trimmedDuration,
      });
    })
  );

  for (const cId of distinctCircleIds) {
    revalidatePath(`/sharedrobe/${cId}`);
  }
  revalidatePath("/sharedrobe");
  revalidatePath("/outfits/builder");

  const count = insertPayload.length;
  return {
    success: true,
    outfitId: trimmedOutfitId,
    requestedCount: count,
    message:
      count === 1
        ? `Sent 1 borrow request (${trimmedDuration}) to complete "${outfit.title}"! ✨`
        : `Sent ${count} borrow requests (${trimmedDuration}) to complete "${outfit.title}"! ✨`,
  };
}

/**
 * 5. Allows an outfit creator to delete their own lookbook.
 */
export async function deleteOutfit(outfitId: string): Promise<OutfitActionResult> {
  if (!isValidUuid(outfitId)) {
    return { success: false, error: "Invalid lookbook ID." };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      success: false,
      error: "Your session has expired. Please sign in again.",
    };
  }

  const trimmedOutfitId = outfitId.trim();

  const { data: outfit } = await supabase
    .from("outfits")
    .select("id, creator_id, circle_id, title")
    .eq("id", trimmedOutfitId)
    .maybeSingle();

  if (!outfit || outfit.creator_id !== user.id) {
    return {
      success: false,
      error: "Only the lookbook creator can delete this outfit.",
    };
  }

  const { error: deleteError } = await supabase
    .from("outfits")
    .delete()
    .eq("id", trimmedOutfitId)
    .eq("creator_id", user.id);

  if (deleteError) {
    return {
      success: false,
      error: "Could not delete lookbook. Please try again.",
    };
  }

  revalidatePath("/outfits/builder");
  revalidatePath("/sharedrobe");
  if (outfit.circle_id) {
    revalidatePath(`/sharedrobe/${outfit.circle_id}`);
  }

  return {
    success: true,
    message: `Deleted lookbook "${outfit.title}".`,
  };
}
