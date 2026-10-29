"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import {
  sendFriendRequestEmail,
  sendCircleJoinRequestEmail,
  sendCircleAddedNotificationEmail,
  sendReturnNudgeEmail,
  sendBorrowRequestEmail,
} from "@/utils/email/resend";
import {
  isValidUuid,
  isValidBorrowDuration,
  isValidNudgeType,
  formatPublicNudgeMessage,
  isValidSosDescription,
  isValidSosTargetDate,
  formatSosRequestActivityMessage,
  formatSosSuggestionActivityMessage,
  type NudgeReturnType,
} from "./constants";

export type ActionResult<T = unknown> =
  | { success: true; message: string; data?: T; notificationSent?: boolean }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

async function getRequestOrigin(): Promise<string> {
  const headerList = await headers();
  const origin = headerList.get("origin");
  if (origin) return origin;
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (host) {
    const protocol = headerList.get("x-forwarded-proto") ?? "https";
    return `${protocol}://${host}`;
  }
  return "https://sharedrobe.app";
}

/**
 * Sends a friend request to a target user by their UUID.
 * Dispatches a Resend notification email to the target recipient.
 */
export async function sendFriendRequest(
  targetUserId: string
): Promise<ActionResult<{ friendshipId: string }>> {
  if (!isValidUuid(targetUserId)) {
    return { success: false, error: "Invalid target user ID specified." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: "Your session has expired. Please sign in to send friend requests.",
    };
  }

  if (user.id === targetUserId) {
    return {
      success: false,
      error: "You cannot send a friend request to yourself.",
    };
  }

  // 1. Fetch target user's profile
  const { data: targetProfile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", targetUserId)
    .maybeSingle();

  if (profileErr || !targetProfile) {
    return {
      success: false,
      error: "The specified user profile could not be found.",
    };
  }

  // 2. Check for existing friendship in either direction
  const { data: existing, error: existingErr } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status")
    .or(
      `and(requester_id.eq.${user.id},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${user.id})`
    )
    .maybeSingle();

  if (existingErr) {
    return { success: false, error: existingErr.message };
  }

  if (existing) {
    if (existing.status === "accepted") {
      return { success: false, error: "You are already connected as friends." };
    }
    if (existing.requester_id === user.id) {
      return {
        success: false,
        error: "You have already sent a friend request to this member.",
      };
    }
    return {
      success: false,
      error: "This member has already sent you a friend request. Check your pending requests tab.",
    };
  }

  // 3. Insert friendship
  const { data: inserted, error: insertErr } = await supabase
    .from("friendships")
    .insert({
      requester_id: user.id,
      addressee_id: targetUserId,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    return {
      success: false,
      error: insertErr?.message || "Failed to create friend request.",
    };
  }

  // 4. Trigger transactional notification email via Resend
  let notificationSent = false;
  try {
    const origin = await getRequestOrigin();
    const senderName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      "A fellow Share Drobe member";

    const emailResult = await sendFriendRequestEmail({
      toEmail: targetProfile.email,
      toName: targetProfile.full_name || "Friend",
      fromName: senderName,
      appUrl: origin,
    });
    notificationSent = Boolean(emailResult.success);
  } catch (err) {
    console.warn("[FriendRequest] Non-fatal notification error:", err);
  }

  revalidatePath("/sharedrobe");
  return {
    success: true,
    message: `Friend request sent to ${targetProfile.full_name || "user"}.`,
    data: { friendshipId: inserted.id },
    notificationSent,
  };
}

/**
 * Responds to an incoming friend request (accept or decline).
 */
export async function respondToFriendRequest(
  friendshipId: string,
  action: "accept" | "decline"
): Promise<ActionResult> {
  if (!isValidUuid(friendshipId)) {
    return { success: false, error: "Invalid friendship ID provided." };
  }

  if (action !== "accept" && action !== "decline") {
    return { success: false, error: "Action must be either accept or decline." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  // Verify the friendship exists and current user is the addressee
  const { data: friendship, error: fetchErr } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status")
    .eq("id", friendshipId)
    .maybeSingle();

  if (fetchErr || !friendship) {
    return {
      success: false,
      error: "Friend request was not found or has already been resolved.",
    };
  }

  if (friendship.addressee_id !== user.id) {
    return {
      success: false,
      error: "You are not authorized to respond to this friend request.",
    };
  }

  if (action === "accept") {
    const { error: updateErr } = await supabase
      .from("friendships")
      .update({
        status: "accepted",
        updated_at: new Date().toISOString(),
      })
      .eq("id", friendshipId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    revalidatePath("/sharedrobe");
    return { success: true, message: "Friend request accepted! You are now connected." };
  } else {
    const { error: deleteErr } = await supabase
      .from("friendships")
      .delete()
      .eq("id", friendshipId);

    if (deleteErr) {
      return { success: false, error: deleteErr.message };
    }

    revalidatePath("/sharedrobe");
    return { success: true, message: "Friend request declined." };
  }
}

/**
 * Creates a new sharing Circle.
 * Automatically designates creator as an approved Admin via database trigger.
 */
export async function createCircle(
  name: string,
  description?: string
): Promise<ActionResult<{ circleId: string; name: string }>> {
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (trimmedName.length < 2 || trimmedName.length > 50) {
    return {
      success: false,
      error: "Circle name must be between 2 and 50 characters long.",
      fieldErrors: { name: "Name must be 2-50 characters" },
    };
  }

  const trimmedDesc = typeof description === "string" ? description.trim() : null;
  if (trimmedDesc && trimmedDesc.length > 250) {
    return {
      success: false,
      error: "Circle description cannot exceed 250 characters.",
      fieldErrors: { description: "Maximum 250 characters" },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required to create a circle." };
  }

  const { data: circle, error: insertErr } = await supabase
    .from("circles")
    .insert({
      name: trimmedName,
      description: trimmedDesc,
      created_by: user.id,
    })
    .select("id, name")
    .single();

  if (insertErr || !circle) {
    return {
      success: false,
      error: insertErr?.message || "Failed to create sharing circle.",
    };
  }

  revalidatePath("/sharedrobe");
  return {
    success: true,
    message: `Circle "${circle.name}" created successfully.`,
    data: { circleId: circle.id, name: circle.name },
  };
}

/**
 * Requests membership to join an existing Circle.
 * Dispatches an email notification to the Circle Admin.
 */
export async function requestJoinCircle(
  circleId: string
): Promise<ActionResult<{ membershipId: string }>> {
  if (!isValidUuid(circleId)) {
    return { success: false, error: "Invalid circle ID provided." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required to join circles." };
  }

  // 1. Fetch circle details
  const { data: circle, error: circleErr } = await supabase
    .from("circles")
    .select("id, name, created_by")
    .eq("id", circleId)
    .maybeSingle();

  if (circleErr || !circle) {
    return { success: false, error: "Circle could not be found." };
  }

  // 2. Check existing membership status
  const { data: existingMember, error: memCheckErr } = await supabase
    .from("circle_members")
    .select("id, role, status")
    .eq("circle_id", circleId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memCheckErr) {
    return { success: false, error: memCheckErr.message };
  }

  if (existingMember) {
    if (existingMember.status === "approved") {
      return { success: false, error: "You are already an active member of this circle." };
    }
    return {
      success: false,
      error: "Your request to join this circle is already pending review.",
    };
  }

  // 3. Insert membership request
  const { data: inserted, error: insertErr } = await supabase
    .from("circle_members")
    .insert({
      circle_id: circleId,
      user_id: user.id,
      role: "member",
      status: "pending",
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    return {
      success: false,
      error: insertErr?.message || "Failed to submit circle membership request.",
    };
  }

  // 4. Send email notification to circle admin
  let notificationSent = false;
  try {
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", circle.created_by)
      .maybeSingle();

    if (adminProfile?.email) {
      const origin = await getRequestOrigin();
      const requesterName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        "A Share Drobe member";

      const emailResult = await sendCircleJoinRequestEmail({
        adminEmail: adminProfile.email,
        adminName: adminProfile.full_name || "Admin",
        requesterName,
        circleName: circle.name,
        appUrl: origin,
      });
      notificationSent = Boolean(emailResult.success);
    }
  } catch (err) {
    console.warn("[CircleJoinRequest] Non-fatal notification error:", err);
  }

  revalidatePath("/sharedrobe");
  return {
    success: true,
    message: `Request to join "${circle.name}" submitted for approval.`,
    data: { membershipId: inserted.id },
    notificationSent,
  };
}

/**
 * Shares an item from the user's private wardrobe into a shared Circle.
 */
export async function shareItemToCircle(
  circleId: string,
  itemId: string
): Promise<ActionResult<{ circleItemId: string }>> {
  if (!isValidUuid(circleId)) {
    return { success: false, error: "Invalid circle ID specified." };
  }
  if (!isValidUuid(itemId)) {
    return { success: false, error: "Invalid item ID specified." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required to share garments." };
  }

  // 1. Verify user is an approved member of this circle
  const { data: member, error: memberErr } = await supabase
    .from("circle_members")
    .select("id, status")
    .eq("circle_id", circleId)
    .eq("user_id", user.id)
    .eq("status", "approved")
    .maybeSingle();

  if (memberErr || !member) {
    return {
      success: false,
      error: "You must be an approved member of this circle to share wardrobe items.",
    };
  }

  // 2. Verify user owns the item
  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("id, title, owner_id")
    .eq("id", itemId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (itemErr || !item) {
    return {
      success: false,
      error: "Garment not found or does not belong to your account.",
    };
  }

  // 3. Verify item is not already shared to this circle
  const { data: existingShare, error: shareCheckErr } = await supabase
    .from("circle_items")
    .select("id")
    .eq("circle_id", circleId)
    .eq("item_id", itemId)
    .maybeSingle();

  if (shareCheckErr) {
    return { success: false, error: shareCheckErr.message };
  }

  if (existingShare) {
    return {
      success: false,
      error: `"${item.title}" is already shared to this circle.`,
    };
  }

  // 4. Insert into circle_items junction table
  const { data: shared, error: insertErr } = await supabase
    .from("circle_items")
    .insert({
      circle_id: circleId,
      item_id: itemId,
      shared_by: user.id,
    })
    .select("id")
    .single();

  if (insertErr || !shared) {
    return {
      success: false,
      error: insertErr?.message || "Failed to share item to circle.",
    };
  }

  // Log 'shared_item' event into circle_activity (non-fatal)
  try {
    await supabase.from("circle_activity").insert({
      circle_id: circleId,
      actor_id: user.id,
      action_type: "shared_item",
      target_item_id: itemId,
      message: `Dropped "${item.title}" into the circle closet! Who's calling dibs? ✨`,
    });
  } catch (activityErr) {
    console.warn("[ShareItemToCircle] Non-fatal activity log error:", activityErr);
  }

  revalidatePath("/sharedrobe");
  revalidatePath(`/sharedrobe/${circleId}`);
  revalidatePath("/");
  return {
    success: true,
    message: `"${item.title}" is now shared in circle!`,
    data: { circleItemId: shared.id },
  };
}

export interface CircleShareOption {
  id: string;
  name: string;
  description: string | null;
  role: "admin" | "member";
  memberCount: number;
  isAlreadyShared: boolean;
}

interface DbMembershipWithCircle {
  circle_id: string;
  role: string;
  circles: {
    id: string;
    name: string;
    description: string | null;
  } | null;
}

/**
 * Fetches all circles where the authenticated user is an approved member,
 * along with an indicator of whether a specific item is already shared in each circle.
 */
export async function getUserApprovedCirclesForItem(
  itemId: string
): Promise<ActionResult<CircleShareOption[]>> {
  if (!isValidUuid(itemId)) {
    return { success: false, error: "Invalid item ID provided." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  // 1. Fetch user's approved circle memberships
  const { data: membershipsData, error: memErr } = await supabase
    .from("circle_members")
    .select(`
      circle_id,
      role,
      circles:circle_id (
        id,
        name,
        description
      )
    `)
    .eq("user_id", user.id)
    .eq("status", "approved");

  if (memErr) {
    return { success: false, error: memErr.message };
  }

  const memberships = (membershipsData as unknown as DbMembershipWithCircle[]) || [];
  const circleIds = memberships.map((m) => m.circle_id);

  if (circleIds.length === 0) {
    return {
      success: true,
      message: "No approved circles found",
      data: [],
    };
  }

  // 2. Fetch existing circle shares for this item
  const { data: existingShares } = await supabase
    .from("circle_items")
    .select("circle_id")
    .eq("item_id", itemId)
    .in("circle_id", circleIds);

  const sharedCircleIdSet = new Set((existingShares || []).map((s) => s.circle_id));

  // 3. Fetch member counts for these circles
  const { data: memberCounts } = await supabase
    .from("circle_members")
    .select("circle_id")
    .in("circle_id", circleIds)
    .eq("status", "approved");

  const countMap = (memberCounts || []).reduce<Record<string, number>>((acc, row) => {
    acc[row.circle_id] = (acc[row.circle_id] || 0) + 1;
    return acc;
  }, {});

  const options: CircleShareOption[] = memberships
    .filter((m): m is DbMembershipWithCircle & { circles: NonNullable<DbMembershipWithCircle["circles"]> } =>
      Boolean(m.circles)
    )
    .map((m) => ({
      id: m.circles.id,
      name: m.circles.name,
      description: m.circles.description,
      role: m.role as "admin" | "member",
      memberCount: countMap[m.circle_id] || 1,
      isAlreadyShared: sharedCircleIdSet.has(m.circle_id),
    }));

  return {
    success: true,
    message: "Circles loaded",
    data: options,
  };
}

/**
 * Shares an item across multiple selected circles simultaneously.
 */
export async function shareItemToCircles(
  circleIds: string[],
  itemId: string
): Promise<ActionResult<{ sharedCount: number }>> {
  if (!isValidUuid(itemId)) {
    return { success: false, error: "Invalid item ID provided." };
  }
  if (!Array.isArray(circleIds) || circleIds.length === 0) {
    return { success: false, error: "Please select at least one circle to share with." };
  }
  for (const cid of circleIds) {
    if (!isValidUuid(cid)) {
      return { success: false, error: `Invalid circle ID: ${cid}` };
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required to share garments." };
  }

  // Verify item ownership
  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("id, title, owner_id")
    .eq("id", itemId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (itemErr || !item) {
    return { success: false, error: "Garment not found or does not belong to your closet." };
  }

  // Verify user is approved member in all target circles
  const { data: memberships, error: memErr } = await supabase
    .from("circle_members")
    .select("circle_id")
    .eq("user_id", user.id)
    .eq("status", "approved")
    .in("circle_id", circleIds);

  if (memErr) {
    return { success: false, error: memErr.message };
  }

  const approvedSet = new Set((memberships || []).map((m) => m.circle_id));
  const unauthorized = circleIds.filter((cid) => !approvedSet.has(cid));
  if (unauthorized.length > 0) {
    return {
      success: false,
      error: "You are not an approved member of all selected circles.",
    };
  }

  // Filter out already-shared circles
  const { data: existingShares } = await supabase
    .from("circle_items")
    .select("circle_id")
    .eq("item_id", itemId)
    .in("circle_id", circleIds);

  const alreadySharedSet = new Set((existingShares || []).map((s) => s.circle_id));
  const newCircleIds = circleIds.filter((cid) => !alreadySharedSet.has(cid));

  if (newCircleIds.length === 0) {
    return {
      success: true,
      message: `"${item.title}" is already shared to all selected circles.`,
      data: { sharedCount: 0 },
    };
  }

  // Insert into circle_items
  const rowsToInsert = newCircleIds.map((cid) => ({
    circle_id: cid,
    item_id: itemId,
    shared_by: user.id,
  }));

  const { error: insertErr } = await supabase
    .from("circle_items")
    .insert(rowsToInsert);

  if (insertErr) {
    return { success: false, error: insertErr.message };
  }

  // Log 'shared_item' activity events across newly shared circles (non-fatal)
  try {
    const activityRows = newCircleIds.map((cid) => ({
      circle_id: cid,
      actor_id: user.id,
      action_type: "shared_item",
      target_item_id: itemId,
      message: `Dropped "${item.title}" into the circle closet! Who's calling dibs? ✨`,
    }));
    await supabase.from("circle_activity").insert(activityRows);
  } catch (activityErr) {
    console.warn("[ShareItemToCircles] Non-fatal activity log error:", activityErr);
  }

  revalidatePath("/sharedrobe");
  newCircleIds.forEach((cid) => revalidatePath(`/sharedrobe/${cid}`));
  revalidatePath("/");
  return {
    success: true,
    message: `"${item.title}" successfully shared to ${newCircleIds.length} ${newCircleIds.length === 1 ? "circle" : "circles"}!`,
    data: { sharedCount: newCircleIds.length },
  };
}

/**
 * Circle Admin approves or rejects a pending circle member request.
 */
export async function respondToCircleMemberRequest(
  membershipId: string,
  decision: "approve" | "reject"
): Promise<ActionResult> {
  if (!isValidUuid(membershipId)) {
    return { success: false, error: "Invalid membership ID provided." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  // 1. Fetch membership and circle info
  const { data: memberRecord, error: memErr } = await supabase
    .from("circle_members")
    .select("id, circle_id, user_id, status")
    .eq("id", membershipId)
    .maybeSingle();

  if (memErr || !memberRecord) {
    return { success: false, error: "Member request could not be found." };
  }

  // 2. Verify current user is an admin of the circle
  const { data: adminCheck } = await supabase
    .from("circle_members")
    .select("id")
    .eq("circle_id", memberRecord.circle_id)
    .eq("user_id", user.id)
    .eq("role", "admin")
    .eq("status", "approved")
    .maybeSingle();

  if (!adminCheck) {
    return {
      success: false,
      error: "You are not an authorized admin for this circle.",
    };
  }

  if (decision === "approve") {
    const { error: updateErr } = await supabase
      .from("circle_members")
      .update({
        status: "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", membershipId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    revalidatePath("/sharedrobe");
    return { success: true, message: "Member request approved!" };
  } else {
    const { error: deleteErr } = await supabase
      .from("circle_members")
      .delete()
      .eq("id", membershipId);

    if (deleteErr) {
      return { success: false, error: deleteErr.message };
    }

    revalidatePath("/sharedrobe");
    return { success: true, message: "Member request declined." };
  }
}

export interface SocialSearchResult {
  profiles: Array<{
    id: string;
    fullName: string;
    email: string;
    friendshipStatus: "none" | "pending_sent" | "pending_received" | "accepted";
    friendshipId?: string;
  }>;
  circles: Array<{
    id: string;
    name: string;
    description: string | null;
    memberCount: number;
    membershipStatus: "none" | "pending" | "approved";
  }>;
}

/**
 * Real-time fuzzy search across member profiles and sharing circles.
 * Includes user relationship status (friendship / circle membership) for each hit.
 */
export async function searchSocial(
  query: string
): Promise<ActionResult<SocialSearchResult>> {
  const trimmed = typeof query === "string" ? query.trim() : "";
  if (trimmed.length < 2) {
    return {
      success: true,
      message: "Search query too short",
      data: { profiles: [], circles: [] },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required to search." };
  }

  const sanitizedQuery = trimmed.replace(/[%_]/g, "");

  // 1. Search profiles (exclude current user)
  const { data: matchedProfiles, error: profileErr } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .neq("id", user.id)
    .or(`full_name.ilike.%${sanitizedQuery}%,email.ilike.%${sanitizedQuery}%`)
    .limit(10);

  if (profileErr) {
    console.error("[SearchSocial] Profile search error:", profileErr);
  }

  const profileIds = matchedProfiles?.map((p) => p.id) || [];
  let userFriendships: Array<{
    id: string;
    requester_id: string;
    addressee_id: string;
    status: string;
  }> = [];

  if (profileIds.length > 0) {
    const { data: friendships } = await supabase
      .from("friendships")
      .select("id, requester_id, addressee_id, status")
      .or(
        `and(requester_id.eq.${user.id},addressee_id.in.(${profileIds.join(",")})),and(addressee_id.eq.${user.id},requester_id.in.(${profileIds.join(",")}))`
      );
    if (friendships) {
      userFriendships = friendships;
    }
  }

  const enrichedProfiles = (matchedProfiles || []).map((p) => {
    const match = userFriendships.find(
      (f) =>
        (f.requester_id === user.id && f.addressee_id === p.id) ||
        (f.addressee_id === user.id && f.requester_id === p.id)
    );

    let friendshipStatus: "none" | "pending_sent" | "pending_received" | "accepted" =
      "none";
    if (match) {
      if (match.status === "accepted") {
        friendshipStatus = "accepted";
      } else if (match.requester_id === user.id) {
        friendshipStatus = "pending_sent";
      } else {
        friendshipStatus = "pending_received";
      }
    }

    return {
      id: p.id,
      fullName: p.full_name || "Drobe Member",
      email: p.email,
      friendshipStatus,
      friendshipId: match?.id,
    };
  });

  // 2. Search circles
  const { data: matchedCircles, error: circleErr } = await supabase
    .from("circles")
    .select("id, name, description, created_by, created_at")
    .ilike("name", `%${sanitizedQuery}%`)
    .limit(10);

  if (circleErr) {
    console.error("[SearchSocial] Circle search error:", circleErr);
  }

  const circleIds = matchedCircles?.map((c) => c.id) || [];
  let circleMemberships: Array<{ circle_id: string; status: string; role: string }> =
    [];
  let allMembersCount: Array<{ circle_id: string }> = [];

  if (circleIds.length > 0) {
    const { data: myMemberships } = await supabase
      .from("circle_members")
      .select("circle_id, status, role")
      .eq("user_id", user.id)
      .in("circle_id", circleIds);
    if (myMemberships) {
      circleMemberships = myMemberships;
    }

    const { data: counts } = await supabase
      .from("circle_members")
      .select("circle_id")
      .in("circle_id", circleIds)
      .eq("status", "approved");
    if (counts) {
      allMembersCount = counts;
    }
  }

  const enrichedCircles = (matchedCircles || []).map((c) => {
    const myMem = circleMemberships.find((m) => m.circle_id === c.id);
    let membershipStatus: "none" | "pending" | "approved" = "none";
    if (myMem) {
      if (myMem.status === "approved") {
        membershipStatus = "approved";
      } else if (myMem.status === "pending") {
        membershipStatus = "pending";
      }
    }

    const memberCount = allMembersCount.filter((m) => m.circle_id === c.id).length;

    return {
      id: c.id,
      name: c.name,
      description: c.description,
      memberCount: Math.max(memberCount, 1),
      membershipStatus,
    };
  });

  return {
    success: true,
    message: "Search completed",
    data: {
      profiles: enrichedProfiles,
      circles: enrichedCircles,
    },
  };
}

export interface CircleFriendCandidate {
  id: string; // friend's profile ID
  fullName: string;
  email: string;
  isAlreadyMember: boolean;
  isPending: boolean;
}

/**
 * Fetches all connected friends for the authenticated user and flags whether
 * each friend is already a member (approved or pending) of the specified circle.
 */
export async function getCircleFriendsStatus(
  circleId: string
): Promise<ActionResult<CircleFriendCandidate[]>> {
  if (!isValidUuid(circleId)) {
    return { success: false, error: "Invalid circle ID provided." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  // 1. Fetch accepted friendships
  const { data: friendshipsData, error: friendErr } = await supabase
    .from("friendships")
    .select(`
      id,
      requester_id,
      addressee_id,
      status,
      requester:requester_id (id, full_name, email),
      addressee:addressee_id (id, full_name, email)
    `)
    .eq("status", "accepted")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  if (friendErr) {
    return { success: false, error: friendErr.message };
  }

  interface FriendWithProfile {
    id: string;
    requester_id: string;
    addressee_id: string;
    requester: { id: string; full_name: string | null; email: string } | null;
    addressee: { id: string; full_name: string | null; email: string } | null;
  }

  const friendships = (friendshipsData as unknown as FriendWithProfile[]) || [];
  const friendsList: Array<{ id: string; fullName: string; email: string }> = [];

  friendships.forEach((f) => {
    const isRequester = f.requester_id === user.id;
    const other = isRequester ? f.addressee : f.requester;
    if (other && other.id) {
      friendsList.push({
        id: other.id,
        fullName: other.full_name || "Drobe Member",
        email: other.email,
      });
    }
  });

  if (friendsList.length === 0) {
    return {
      success: true,
      message: "No connected friends found",
      data: [],
    };
  }

  const friendIds = friendsList.map((f) => f.id);

  // 2. Fetch existing circle memberships for these friends in circleId
  const { data: circleMembers, error: memErr } = await supabase
    .from("circle_members")
    .select("user_id, status")
    .eq("circle_id", circleId)
    .in("user_id", friendIds);

  if (memErr) {
    return { success: false, error: memErr.message };
  }

  const memberStatusMap = new Map<string, string>();
  (circleMembers || []).forEach((m) => {
    memberStatusMap.set(m.user_id, m.status);
  });

  const candidates: CircleFriendCandidate[] = friendsList.map((f) => {
    const status = memberStatusMap.get(f.id);
    return {
      id: f.id,
      fullName: f.fullName,
      email: f.email,
      isAlreadyMember: status === "approved",
      isPending: status === "pending",
    };
  });

  return {
    success: true,
    message: "Friends loaded",
    data: candidates,
  };
}

/**
 * Adds one or more connected friends into a sharing circle.
 * Validates:
 * - circleId is valid UUID
 * - friendUserIds is non-empty array of valid UUIDs
 * - Authenticated session
 * - Current user is an authorized admin or member of this circle (RLS enforces circle admin)
 * - All target users are accepted friends of current user
 * - Filters out friends who are already members of this circle (prevents duplicate key errors)
 * - Inserts into circle_members with role: 'member', status: 'approved'
 * - Dispatches transactional email notifications via Resend (defensive try/catch)
 * - Revalidates /sharedrobe
 */
export async function addFriendsToCircle(
  circleId: string,
  friendUserIds: string[]
): Promise<ActionResult<{ addedCount: number }>> {
  if (!isValidUuid(circleId)) {
    return { success: false, error: "Invalid circle ID provided." };
  }
  if (!Array.isArray(friendUserIds) || friendUserIds.length === 0) {
    return {
      success: false,
      error: "Please select at least one friend to add to the circle.",
    };
  }
  for (const fid of friendUserIds) {
    if (!isValidUuid(fid)) {
      return { success: false, error: `Invalid friend user ID: ${fid}` };
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required to add members." };
  }

  // 1. Fetch circle details
  const { data: circle, error: circleErr } = await supabase
    .from("circles")
    .select("id, name, created_by")
    .eq("id", circleId)
    .maybeSingle();

  if (circleErr || !circle) {
    return { success: false, error: "Circle could not be found." };
  }

  // 2. Verify current user is an approved admin of the circle
  const { data: currentMember, error: memberErr } = await supabase
    .from("circle_members")
    .select("id, role, status")
    .eq("circle_id", circleId)
    .eq("user_id", user.id)
    .eq("status", "approved")
    .maybeSingle();

  if (memberErr || !currentMember) {
    return {
      success: false,
      error: "You must be an approved member of this circle to manage members.",
    };
  }

  // 3. Verify all selected users are accepted friends of the current user
  const { data: friendships, error: friendErr } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status")
    .eq("status", "accepted")
    .or(
      `and(requester_id.eq.${user.id},addressee_id.in.(${friendUserIds.join(",")})),and(addressee_id.eq.${user.id},requester_id.in.(${friendUserIds.join(",")}))`
    );

  if (friendErr) {
    return { success: false, error: friendErr.message };
  }

  const verifiedFriendIds = new Set(
    (friendships || []).map((f) =>
      f.requester_id === user.id ? f.addressee_id : f.requester_id
    )
  );

  const unauthorizedFriends = friendUserIds.filter(
    (fid) => !verifiedFriendIds.has(fid)
  );
  if (unauthorizedFriends.length > 0) {
    return {
      success: false,
      error: "You can only add users who are connected as accepted friends in your network.",
    };
  }

  // 4. Check for existing circle memberships to avoid duplicates
  const { data: existingMembers, error: existingErr } = await supabase
    .from("circle_members")
    .select("user_id, status")
    .eq("circle_id", circleId)
    .in("user_id", friendUserIds);

  if (existingErr) {
    return { success: false, error: existingErr.message };
  }

  const existingMemberIdSet = new Set(
    (existingMembers || []).map((m) => m.user_id)
  );
  const newFriendIds = friendUserIds.filter(
    (fid) => !existingMemberIdSet.has(fid)
  );

  if (newFriendIds.length === 0) {
    return {
      success: true,
      message: "All selected friends are already members of this circle.",
      data: { addedCount: 0 },
    };
  }

  // 5. Insert new members into circle_members
  const rowsToInsert = newFriendIds.map((friendId) => ({
    circle_id: circleId,
    user_id: friendId,
    role: "member",
    status: "approved",
  }));

  const { error: insertErr } = await supabase
    .from("circle_members")
    .insert(rowsToInsert);

  if (insertErr) {
    return {
      success: false,
      error: insertErr.message || "Failed to add friends to circle.",
    };
  }

  // 6. Send transactional email notifications to newly added friends
  try {
    const { data: friendProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", newFriendIds);

    if (friendProfiles && friendProfiles.length > 0) {
      const origin = await getRequestOrigin();
      const addedByName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        "A friend on Share Drobe";

      await Promise.allSettled(
        friendProfiles.map((fp) =>
          sendCircleAddedNotificationEmail({
            friendEmail: fp.email,
            friendName: fp.full_name || "Friend",
            circleName: circle.name,
            addedByName,
            appUrl: origin,
          })
        )
      );
    }
  } catch (err) {
    console.warn("[AddFriendsToCircle] Non-fatal notification error:", err);
  }

  revalidatePath("/sharedrobe");
  return {
    success: true,
    message: `Successfully added ${newFriendIds.length} ${
      newFriendIds.length === 1 ? "friend" : "friends"
    } to "${circle.name}"!`,
    data: { addedCount: newFriendIds.length },
  };
}

// ==============================================================================
// Sprint 3: Circle Engine — Borrow Requests, Activity / Drama Feed & Member Admin
// ==============================================================================

/**
 * Submits a playful borrow request for a garment inside a shared circle.
 * Validates:
 * - itemId and circleId are valid UUIDs
 * - durationIntent matches one of the 4 official fun borrow durations
 * - Authenticated user is an approved member of circleId
 * - Item exists, is shared in circleId, is not owned by the requester, and is 'Available'
 * - Prevents duplicate active pending borrow requests
 */
export async function createBorrowRequest(
  itemId: string,
  circleId: string,
  durationIntent: string
): Promise<ActionResult<{ requestId: string }>> {
  if (!isValidUuid(itemId)) {
    return { success: false, error: "Invalid garment ID specified." };
  }
  if (!isValidUuid(circleId)) {
    return { success: false, error: "Invalid circle ID specified." };
  }

  const trimmedDuration =
    typeof durationIntent === "string" ? durationIntent.trim() : "";
  if (!isValidBorrowDuration(trimmedDuration)) {
    return {
      success: false,
      error: "Please pick how long you're planning to hijack this piece!",
      fieldErrors: {
        durationIntent: "Select a valid borrow duration from the dropdown.",
      },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: "Please sign in to call dibs on circle garments.",
    };
  }

  // 1. Verify requester is an approved member of this circle
  const { data: membership, error: memErr } = await supabase
    .from("circle_members")
    .select("id, status")
    .eq("circle_id", circleId)
    .eq("user_id", user.id)
    .eq("status", "approved")
    .maybeSingle();

  if (memErr || !membership) {
    return {
      success: false,
      error: "You must be an approved member of this circle to borrow garments.",
    };
  }

  // 2. Fetch item details and verify it is shared in this circle
  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("id, title, owner_id, status")
    .eq("id", itemId)
    .maybeSingle();

  if (itemErr || !item) {
    return {
      success: false,
      error: "Could not find this garment in the closet.",
    };
  }

  if (item.owner_id === user.id) {
    return {
      success: false,
      error: "Wait a sec — this is already your piece! No need to borrow from yourself.",
    };
  }

  if (item.status !== "Available") {
    return {
      success: false,
      error: `Too slow! "${item.title}" is currently ${item.status} and unavailable to borrow right now.`,
    };
  }

  const { data: sharedInCircle } = await supabase
    .from("circle_items")
    .select("id")
    .eq("circle_id", circleId)
    .eq("item_id", itemId)
    .maybeSingle();

  if (!sharedInCircle) {
    return {
      success: false,
      error: "This garment is not currently shared inside this circle.",
    };
  }

  // 3. Check for existing pending request from this user for this item
  const { data: existingReq } = await supabase
    .from("borrow_requests")
    .select("id, status")
    .eq("item_id", itemId)
    .eq("requester_id", user.id)
    .eq("circle_id", circleId)
    .eq("status", "pending")
    .maybeSingle();

  if (existingReq) {
    return {
      success: false,
      error: `Hang tight! You already called dibs on "${item.title}" — waiting on the owner's green light.`,
    };
  }

  // 4. Insert borrow request
  const { data: created, error: insertErr } = await supabase
    .from("borrow_requests")
    .insert({
      item_id: itemId,
      requester_id: user.id,
      circle_id: circleId,
      status: "pending",
      duration_intent: trimmedDuration,
    })
    .select("id")
    .single();

  if (insertErr || !created) {
    return {
      success: false,
      error: insertErr?.message || "Failed to submit borrow request.",
    };
  }

  // 5. Non-fatal notification email to the garment owner
  let notificationSent = false;
  try {
    const [{ data: ownerProfile }, { data: circleData }, { data: requesterProfile }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", item.owner_id)
          .maybeSingle(),
        supabase
          .from("circles")
          .select("name")
          .eq("id", circleId)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

    if (ownerProfile?.email) {
      const origin = await getRequestOrigin();
      const requesterName =
        requesterProfile?.full_name ||
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        "A circle bestie";

      const emailRes = await sendBorrowRequestEmail({
        ownerEmail: ownerProfile.email,
        ownerName: ownerProfile.full_name || "Closet Icon",
        requesterName,
        itemTitle: item.title,
        circleName: circleData?.name || "Your Circle",
        durationIntent: trimmedDuration,
        appUrl: origin,
      });
      notificationSent = Boolean(emailRes.success);
    }
  } catch (err) {
    console.warn("[CreateBorrowRequest] Non-fatal notification error:", err);
  }

  revalidatePath("/sharedrobe");
  revalidatePath(`/sharedrobe/${circleId}`);
  revalidatePath(`/items/${itemId}`);
  return {
    success: true,
    message: `Dibs called! ✨ Borrow request sent for "${item.title}" (${trimmedDuration}).`,
    data: { requestId: created.id },
    notificationSent,
  };
}

/**
 * Approves a pending borrow request.
 * - Verifies authenticated user is the owner of the requested garment
 * - Updates borrow_requests status to 'approved' (and auto-rejects competing pending requests)
 * - Updates items status to 'Lent Out' and sets borrowed_by = requester_id
 * - Logs a playful 'borrowed_item' event into circle_activity
 */
export async function approveBorrowRequest(
  requestId: string
): Promise<ActionResult<{ itemId: string; circleId: string }>> {
  if (!isValidUuid(requestId)) {
    return { success: false, error: "Invalid borrow request ID provided." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: "Authentication required to approve borrow requests.",
    };
  }

  // 1. Fetch borrow request
  const { data: requestRow, error: reqErr } = await supabase
    .from("borrow_requests")
    .select("id, item_id, requester_id, circle_id, status, duration_intent")
    .eq("id", requestId)
    .maybeSingle();

  if (reqErr || !requestRow) {
    return {
      success: false,
      error: "Borrow request could not be found or was already handled.",
    };
  }

  if (requestRow.status !== "pending") {
    return {
      success: false,
      error: `This borrow request has already been ${requestRow.status}.`,
    };
  }

  // 2. Verify current user strictly owns the garment
  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("id, title, owner_id, status")
    .eq("id", requestRow.item_id)
    .maybeSingle();

  if (itemErr || !item) {
    return {
      success: false,
      error: "Associated garment could not be found.",
    };
  }

  if (item.owner_id !== user.id) {
    return {
      success: false,
      error: "Only the garment owner can approve a borrow request.",
    };
  }

  // 3. Mark the request as 'approved'
  const nowIso = new Date().toISOString();
  const { error: updateReqErr } = await supabase
    .from("borrow_requests")
    .update({
      status: "approved",
      updated_at: nowIso,
    })
    .eq("id", requestId);

  if (updateReqErr) {
    return {
      success: false,
      error: updateReqErr.message || "Failed to update borrow request status.",
    };
  }

  // Auto-decline any other competing pending requests for this same garment
  await supabase
    .from("borrow_requests")
    .update({ status: "rejected", updated_at: nowIso })
    .eq("item_id", item.id)
    .eq("status", "pending")
    .neq("id", requestId);

  // 4. Update item status to 'Lent Out' and set borrowed_by
  const { error: updateItemErr } = await supabase
    .from("items")
    .update({
      status: "Lent Out",
      borrowed_by: requestRow.requester_id,
    })
    .eq("id", item.id)
    .eq("owner_id", user.id);

  if (updateItemErr) {
    return {
      success: false,
      error: updateItemErr.message || "Failed to mark garment as Lent Out.",
    };
  }

  // 5. Log 'borrowed_item' event into circle_activity
  const [{ data: borrowerProfile }, { data: ownerProfile }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", requestRow.requester_id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const borrowerName = borrowerProfile?.full_name || "A circle friend";
  const ownerName =
    ownerProfile?.full_name ||
    user.user_metadata?.full_name ||
    "their friend";

  const activityMessage = `${borrowerName} snagged "${item.title}" from ${ownerName} — "${requestRow.duration_intent}" ✨`;

  const { error: activityErr } = await supabase.from("circle_activity").insert({
    circle_id: requestRow.circle_id,
    actor_id: requestRow.requester_id,
    action_type: "borrowed_item",
    target_item_id: item.id,
    message: activityMessage,
  });

  if (activityErr) {
    console.warn("[ApproveBorrowRequest] Activity insert warning:", activityErr);
  }

  revalidatePath("/sharedrobe");
  revalidatePath(`/sharedrobe/${requestRow.circle_id}`);
  revalidatePath(`/items/${item.id}`);
  revalidatePath("/");

  return {
    success: true,
    message: `It's official! "${item.title}" is now lent out to ${borrowerName}. ✨`,
    data: { itemId: item.id, circleId: requestRow.circle_id },
  };
}

/**
 * Declines a pending borrow request. Strictly restricted to the garment owner or the requester.
 */
export async function rejectBorrowRequest(
  requestId: string
): Promise<ActionResult> {
  if (!isValidUuid(requestId)) {
    return { success: false, error: "Invalid borrow request ID provided." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const { data: requestRow } = await supabase
    .from("borrow_requests")
    .select("id, item_id, requester_id, circle_id, status")
    .eq("id", requestId)
    .maybeSingle();

  if (!requestRow) {
    return { success: false, error: "Borrow request not found." };
  }

  const { data: item } = await supabase
    .from("items")
    .select("id, title, owner_id")
    .eq("id", requestRow.item_id)
    .maybeSingle();

  if (requestRow.requester_id !== user.id && item?.owner_id !== user.id) {
    return {
      success: false,
      error: "You are not authorized to decline this borrow request.",
    };
  }

  const { error: updateErr } = await supabase
    .from("borrow_requests")
    .update({
      status: "rejected",
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  revalidatePath("/sharedrobe");
  revalidatePath(`/sharedrobe/${requestRow.circle_id}`);
  revalidatePath(`/items/${requestRow.item_id}`);

  return {
    success: true,
    message: "Borrow request declined.",
  };
}

/**
 * Triggers a return nudge for a lent-out garment:
 * - 'private': Sends a friendly Resend email to the borrower.
 * - 'public': Inserts a playful 'public_nudge' call-out into circle_activity.
 */
export async function nudgeReturn(
  itemId: string,
  type: NudgeReturnType
): Promise<ActionResult<{ type: NudgeReturnType; notificationSent?: boolean }>> {
  if (!isValidUuid(itemId)) {
    return { success: false, error: "Invalid garment ID specified." };
  }
  if (!isValidNudgeType(type)) {
    return {
      success: false,
      error: "Nudge type must be either 'private' or 'public'.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: "Authentication required to nudge for a return.",
    };
  }

  // 1. Fetch item and verify current user is the owner and item is 'Lent Out'
  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("id, title, owner_id, status, borrowed_by")
    .eq("id", itemId)
    .maybeSingle();

  if (itemErr || !item) {
    return { success: false, error: "Garment could not be found." };
  }

  if (item.owner_id !== user.id) {
    return {
      success: false,
      error: "Only the garment's rightful owner can ask for it back!",
    };
  }

  if (item.status !== "Lent Out" || !item.borrowed_by) {
    return {
      success: false,
      error: `"${item.title}" isn't currently lent out to anyone.`,
    };
  }

  // 2. Fetch borrower and owner profile info
  const [{ data: borrowerProfile }, { data: ownerProfile }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", item.borrowed_by)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const borrowerName = borrowerProfile?.full_name || "Your Friend";
  const ownerName =
    ownerProfile?.full_name ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    "Your Friend";

  // Branch A: Private Email Nudge via Resend
  if (type === "private") {
    if (!borrowerProfile?.email) {
      return {
        success: false,
        error: "Could not find an email address for the borrower.",
      };
    }

    let notificationSent = false;
    try {
      const origin = await getRequestOrigin();
      const emailResult = await sendReturnNudgeEmail({
        borrowerEmail: borrowerProfile.email,
        borrowerName,
        ownerName,
        itemTitle: item.title,
        appUrl: origin,
      });
      notificationSent = Boolean(emailResult.success);
    } catch (err) {
      console.warn("[NudgeReturn:Private] Non-fatal Resend error:", err);
    }

    revalidatePath(`/items/${item.id}`);
    return {
      success: true,
      message: `Gentle private nudge sent to ${borrowerName}! Zero public drama (for now). 💌`,
      data: { type: "private", notificationSent },
      notificationSent,
    };
  }

  // Branch B: Public Call-out ('public_nudge') in circle_activity
  // Resolve target circle(s) where the item was borrowed or shared
  const targetCircleIds = new Set<string>();

  // 1) Check approved borrow_requests for this item & borrower
  const { data: approvedBorrowReq } = await supabase
    .from("borrow_requests")
    .select("circle_id")
    .eq("item_id", item.id)
    .eq("requester_id", item.borrowed_by)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (approvedBorrowReq?.circle_id) {
    targetCircleIds.add(approvedBorrowReq.circle_id);
  }

  // 2) Fallback: find circles where this item is shared
  if (targetCircleIds.size === 0) {
    const { data: sharedCircles } = await supabase
      .from("circle_items")
      .select("circle_id")
      .eq("item_id", item.id);

    (sharedCircles || []).forEach((row) => targetCircleIds.add(row.circle_id));
  }

  // 3) Second fallback: find any mutual circle where both owner and borrower are approved members
  if (targetCircleIds.size === 0) {
    const [{ data: ownerCircles }, { data: borrowerCircles }] = await Promise.all([
      supabase
        .from("circle_members")
        .select("circle_id")
        .eq("user_id", user.id)
        .eq("status", "approved"),
      supabase
        .from("circle_members")
        .select("circle_id")
        .eq("user_id", item.borrowed_by)
        .eq("status", "approved"),
    ]);

    const borrowerCircleSet = new Set(
      (borrowerCircles || []).map((c) => c.circle_id)
    );
    (ownerCircles || []).forEach((c) => {
      if (borrowerCircleSet.has(c.circle_id)) {
        targetCircleIds.add(c.circle_id);
      }
    });
  }

  if (targetCircleIds.size === 0) {
    return {
      success: false,
      error:
        "No shared circle found with this borrower to post a public call-out! Try sending a private email nudge instead.",
    };
  }

  const nudgeMessage = formatPublicNudgeMessage(
    borrowerName,
    item.title,
    ownerName
  );

  const activityRows = Array.from(targetCircleIds).map((cid) => ({
    circle_id: cid,
    actor_id: user.id,
    action_type: "public_nudge" as const,
    target_item_id: item.id,
    message: nudgeMessage,
  }));

  const { error: insertActErr } = await supabase
    .from("circle_activity")
    .insert(activityRows);

  if (insertActErr) {
    return {
      success: false,
      error:
        insertActErr.message || "Failed to post public nudge to the Drama Feed.",
    };
  }

  revalidatePath("/sharedrobe");
  targetCircleIds.forEach((cid) => revalidatePath(`/sharedrobe/${cid}`));
  revalidatePath(`/items/${item.id}`);

  return {
    success: true,
    message: `Drama deployed! 🚨 Public call-out posted to the Circle Feed targeting ${borrowerName}!`,
    data: { type: "public" },
  };
}

/**
 * Removes a member from a circle.
 * Strictly verifies that the authenticated actor is an approved Circle Admin.
 * Supports passing either circle_members.id OR the member's user_id (profiles.id).
 */
export async function removeCircleMember(
  circleId: string,
  memberId: string
): Promise<ActionResult<{ removedUserId: string }>> {
  if (!isValidUuid(circleId)) {
    return { success: false, error: "Invalid circle ID specified." };
  }
  if (!isValidUuid(memberId)) {
    return { success: false, error: "Invalid member ID specified." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: "Authentication required to manage circle members.",
    };
  }

  // 1. Verify actor is an approved admin of circleId
  const { data: adminRecord, error: adminErr } = await supabase
    .from("circle_members")
    .select("id, role, status")
    .eq("circle_id", circleId)
    .eq("user_id", user.id)
    .eq("role", "admin")
    .eq("status", "approved")
    .maybeSingle();

  if (adminErr || !adminRecord) {
    return {
      success: false,
      error: "Only Circle Admins have permission to remove members from this circle.",
    };
  }

  // 2. Locate target membership record (accepts either circle_members.id or user_id)
  const { data: targetMember, error: targetErr } = await supabase
    .from("circle_members")
    .select("id, circle_id, user_id, role")
    .eq("circle_id", circleId)
    .or(`id.eq.${memberId},user_id.eq.${memberId}`)
    .maybeSingle();

  if (targetErr || !targetMember) {
    return {
      success: false,
      error: "Member could not be found in this circle.",
    };
  }

  if (targetMember.user_id === user.id) {
    return {
      success: false,
      error: "Admins cannot remove themselves from their own circle.",
    };
  }

  // 3. Remove any items shared by this member inside this circle
  await supabase
    .from("circle_items")
    .delete()
    .eq("circle_id", circleId)
    .eq("shared_by", targetMember.user_id);

  // 4. Delete the circle_members row
  const { error: deleteErr } = await supabase
    .from("circle_members")
    .delete()
    .eq("id", targetMember.id)
    .eq("circle_id", circleId);

  if (deleteErr) {
    return {
      success: false,
      error: deleteErr.message || "Failed to remove member from circle.",
    };
  }

  revalidatePath("/sharedrobe");
  revalidatePath(`/sharedrobe/${circleId}`);

  return {
    success: true,
    message: "Member has been removed from the circle.",
    data: { removedUserId: targetMember.user_id },
  };
}

/**
 * Allows a non-admin circle member to leave a circle.
 * Removes any items they shared in the circle and deletes their circle_members row.
 */
export async function leaveCircle(
  circleId: string
): Promise<ActionResult<{ circleId: string }>> {
  if (!isValidUuid(circleId)) {
    return { success: false, error: "Invalid circle ID specified." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: "Authentication required to leave a circle.",
    };
  }

  const { data: myMembership, error: memberErr } = await supabase
    .from("circle_members")
    .select("id, role, status")
    .eq("circle_id", circleId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberErr || !myMembership) {
    return {
      success: false,
      error: "You are not a member of this circle.",
    };
  }

  if (myMembership.role === "admin") {
    return {
      success: false,
      error: "Circle admins cannot leave their own circle.",
    };
  }

  // Remove any items shared by this user inside this circle
  await supabase
    .from("circle_items")
    .delete()
    .eq("circle_id", circleId)
    .eq("shared_by", user.id);

  // Delete the user's membership row
  const { error: deleteErr } = await supabase
    .from("circle_members")
    .delete()
    .eq("id", myMembership.id)
    .eq("user_id", user.id);

  if (deleteErr) {
    return {
      success: false,
      error: deleteErr.message || "Failed to leave circle.",
    };
  }

  revalidatePath("/sharedrobe");
  revalidatePath(`/sharedrobe/${circleId}`);

  return {
    success: true,
    message: "You have left the circle.",
    data: { circleId },
  };
}

/**
 * Resolves public lend/borrow drama:
 * - Marks the lent garment back to 'Available' and clears borrowed_by (when called by item owner)
 * - Transitions active borrow_requests for the garment to 'returned'
 * - Clears 'public_nudge' call-out siren cards for the garment from circle_activity
 * - Logs a peaceful resolution message in the circle feed
 */
export async function resolveBorrowDrama(params: {
  itemId?: string | null;
  activityId?: string | null;
  circleId?: string | null;
}): Promise<ActionResult<{ itemId?: string | null }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: "Authentication required to resolve borrow drama.",
    };
  }

  let resolvedItemId =
    params.itemId && isValidUuid(params.itemId) ? params.itemId.trim() : null;
  let resolvedCircleId =
    params.circleId && isValidUuid(params.circleId)
      ? params.circleId.trim()
      : null;
  const resolvedActivityId =
    params.activityId && isValidUuid(params.activityId)
      ? params.activityId.trim()
      : null;

  if (!resolvedItemId && !resolvedActivityId) {
    return {
      success: false,
      error: "Please specify an item or call-out card to resolve.",
    };
  }

  // If activityId was passed, inspect the circle_activity row
  if (resolvedActivityId) {
    const { data: actRow } = await supabase
      .from("circle_activity")
      .select("id, circle_id, actor_id, action_type, target_item_id")
      .eq("id", resolvedActivityId)
      .maybeSingle();

    if (actRow) {
      if (!resolvedItemId && actRow.target_item_id) {
        resolvedItemId = actRow.target_item_id;
      }
      if (!resolvedCircleId && actRow.circle_id) {
        resolvedCircleId = actRow.circle_id;
      }
    }
  }

  let itemTitle = "Borrowed Piece";
  let itemOwnerId: string | null = null;

  if (resolvedItemId) {
    const { data: itemRow } = await supabase
      .from("items")
      .select("id, title, owner_id, status, borrowed_by")
      .eq("id", resolvedItemId)
      .maybeSingle();

    if (itemRow) {
      itemTitle = itemRow.title || "Borrowed Piece";
      itemOwnerId = itemRow.owner_id;

      const isOwner = itemRow.owner_id === user.id;
      const isBorrower = itemRow.borrowed_by === user.id;

      // Also check if user is circle admin when resolving a call-out in a circle
      let isCircleAdmin = false;
      if (resolvedCircleId) {
        const { data: adminCheck } = await supabase
          .from("circle_members")
          .select("role, status")
          .eq("circle_id", resolvedCircleId)
          .eq("user_id", user.id)
          .eq("role", "admin")
          .eq("status", "approved")
          .maybeSingle();
        isCircleAdmin = Boolean(adminCheck);
      }

      if (!isOwner && !isBorrower && !isCircleAdmin) {
        return {
          success: false,
          error:
            "Only the garment owner, the borrower, or a Circle Admin can resolve this borrow drama.",
        };
      }

      // 1. If the owner is resolving (or item is owned by user), reset item to 'Available'
      if (isOwner) {
        const { error: itemUpdateErr } = await supabase
          .from("items")
          .update({
            status: "Available",
            borrowed_by: null,
          })
          .eq("id", resolvedItemId)
          .eq("owner_id", user.id);

        if (itemUpdateErr) {
          console.error(
            "[resolveBorrowDrama] Error resetting item status:",
            itemUpdateErr
          );
        }
      }

      // 2. Mark any active ('approved' or 'pending') borrow_requests for this item as 'returned'
      await supabase
        .from("borrow_requests")
        .update({
          status: "returned",
          updated_at: new Date().toISOString(),
        })
        .eq("item_id", resolvedItemId)
        .in("status", ["approved", "pending"]);

      // 3. Remove active 'public_nudge' call-out rows for this item
      await supabase
        .from("circle_activity")
        .delete()
        .eq("target_item_id", resolvedItemId)
        .eq("action_type", "public_nudge");
    }
  }

  // Also delete the specific activityId if it was a public_nudge
  if (resolvedActivityId) {
    await supabase
      .from("circle_activity")
      .delete()
      .eq("id", resolvedActivityId)
      .eq("action_type", "public_nudge");
  }

  // 4. Log a peaceful resolution note into the circle feed so members see the happy ending
  if (resolvedCircleId) {
    const { data: actorProfile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle();

    const actorName =
      actorProfile?.full_name ||
      actorProfile?.email?.split("@")[0] ||
      "Circle Member";

    const isOwnerResolving = itemOwnerId === user.id;
    const resolutionMessage = isOwnerResolving
      ? `🕊️ Drama Resolved! ${actorName} confirmed "${itemTitle}" is back home & Available again ✨`
      : `🕊️ Drama Squashed! ${actorName} returned "${itemTitle}" — peace is restored in the closet ✨`;

    await supabase.from("circle_activity").insert({
      circle_id: resolvedCircleId,
      actor_id: user.id,
      action_type: "shared_item",
      target_item_id: resolvedItemId,
      message: resolutionMessage,
    });
  }

  revalidatePath("/");
  revalidatePath("/sharedrobe");
  if (resolvedCircleId) {
    revalidatePath(`/sharedrobe/${resolvedCircleId}`);
  }
  if (resolvedItemId) {
    revalidatePath(`/items/${resolvedItemId}`);
  }

  return {
    success: true,
    message: `🕊️ Drama resolved! "${itemTitle}" is marked returned and the call-out has been cleared.`,
    data: { itemId: resolvedItemId },
  };
}

/**
 * Allows a borrower to cancel their own pending borrow request before the lender approves it.
 */
export async function cancelBorrowRequest(params: {
  requestId?: string | null;
  itemId?: string | null;
  circleId?: string | null;
}): Promise<ActionResult<{ itemId?: string | null }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: "Authentication required to cancel a borrow request.",
    };
  }

  const validRequestId =
    params.requestId && isValidUuid(params.requestId)
      ? params.requestId.trim()
      : null;
  const validItemId =
    params.itemId && isValidUuid(params.itemId) ? params.itemId.trim() : null;
  const validCircleId =
    params.circleId && isValidUuid(params.circleId)
      ? params.circleId.trim()
      : null;

  if (!validRequestId && !validItemId) {
    return {
      success: false,
      error: "Invalid borrow request or garment ID.",
    };
  }

  let lookupQuery = supabase
    .from("borrow_requests")
    .select("id, item_id, circle_id, status")
    .eq("requester_id", user.id)
    .eq("status", "pending");

  if (validRequestId) {
    lookupQuery = lookupQuery.eq("id", validRequestId);
  } else if (validItemId) {
    lookupQuery = lookupQuery.eq("item_id", validItemId);
  }

  const { data: pendingRows, error: lookupError } = await lookupQuery;

  if (lookupError) {
    console.error("[cancelBorrowRequest] Lookup error:", lookupError);
    return {
      success: false,
      error: "Failed to locate your pending borrow request.",
    };
  }

  if (!pendingRows || pendingRows.length === 0) {
    return {
      success: false,
      error:
        "No pending borrow request found — the owner may have already responded.",
    };
  }

  const targetIds = pendingRows.map((r) => r.id);
  const resolvedItemId = validItemId ?? pendingRows[0]?.item_id ?? null;
  const resolvedCircleId = validCircleId ?? pendingRows[0]?.circle_id ?? null;

  const { error: deleteError } = await supabase
    .from("borrow_requests")
    .delete()
    .in("id", targetIds)
    .eq("requester_id", user.id)
    .eq("status", "pending");

  if (deleteError) {
    console.error("[cancelBorrowRequest] Delete error:", deleteError);
    return {
      success: false,
      error: "Could not cancel borrow request. Please try again.",
    };
  }

  revalidatePath("/");
  revalidatePath("/sharedrobe");
  if (resolvedCircleId) {
    revalidatePath(`/sharedrobe/${resolvedCircleId}`);
  }
  if (resolvedItemId) {
    revalidatePath(`/items/${resolvedItemId}`);
  }

  return {
    success: true,
    message: "Borrow request cancelled. You can request this piece again anytime!",
    data: { itemId: resolvedItemId },
  };
}

/**
 * Creates an SOS event request inside a circle.
 * Validates membership, formats activity feed entry, and revalidates paths.
 */
export async function createSosRequest(
  circleId: string,
  eventDescription: string,
  targetDate: string
): Promise<ActionResult<{ sosId: string }>> {
  if (!isValidUuid(circleId)) {
    return { success: false, error: "Invalid circle ID specified." };
  }

  const trimmedDesc =
    typeof eventDescription === "string" ? eventDescription.trim() : "";
  if (!isValidSosDescription(trimmedDesc)) {
    return {
      success: false,
      error:
        "Please provide a valid event description (between 3 and 500 characters).",
      fieldErrors: {
        eventDescription: "Description must be between 3 and 500 characters.",
      },
    };
  }

  const trimmedDate = typeof targetDate === "string" ? targetDate.trim() : "";
  if (!isValidSosTargetDate(trimmedDate)) {
    return {
      success: false,
      error: "Please select a valid event date (YYYY-MM-DD).",
      fieldErrors: {
        targetDate: "Select a valid event date.",
      },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: "Your session has expired. Please sign in to post an SOS request.",
    };
  }

  // Verify approved circle membership
  const { data: membership, error: memErr } = await supabase
    .from("circle_members")
    .select("id, status")
    .eq("circle_id", circleId)
    .eq("user_id", user.id)
    .eq("status", "approved")
    .maybeSingle();

  if (memErr || !membership) {
    return {
      success: false,
      error:
        "You must be an approved member of this circle to post an SOS request.",
    };
  }

  // Insert SOS request
  const { data: sos, error: insertErr } = await supabase
    .from("sos_requests")
    .insert({
      requester_id: user.id,
      circle_id: circleId,
      event_description: trimmedDesc,
      target_date: trimmedDate,
      status: "active",
    })
    .select("id")
    .single();

  if (insertErr || !sos) {
    console.error("[createSosRequest] Insert error:", insertErr);
    return {
      success: false,
      error: insertErr?.message || "Failed to create SOS request.",
    };
  }

  // Circle activity feed entry (non-fatal)
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    const requesterName =
      profile?.full_name ||
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      "A circle bestie";

    await supabase.from("circle_activity").insert({
      circle_id: circleId,
      actor_id: user.id,
      action_type: "sos_request",
      target_sos_id: sos.id,
      message: formatSosRequestActivityMessage(requesterName, trimmedDesc),
    });
  } catch (feedErr) {
    console.warn("[createSosRequest] Feed activity error (non-fatal):", feedErr);
  }

  revalidatePath("/sharedrobe");
  revalidatePath(`/sharedrobe/${circleId}`);

  return {
    success: true,
    message:
      "SOS signal sent! Your circle has been alerted to save your outfit crisis.",
    data: { sosId: sos.id },
  };
}

/**
 * Suggests an available wardrobe piece owned by the user for an active SOS request.
 */
export async function suggestItemForSos(
  sosId: string,
  itemId: string
): Promise<ActionResult<{ suggestionId: string }>> {
  if (!isValidUuid(sosId)) {
    return { success: false, error: "Invalid SOS request ID." };
  }
  if (!isValidUuid(itemId)) {
    return { success: false, error: "Invalid item ID." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: "Your session has expired. Please sign in to suggest an item.",
    };
  }

  // 1. Fetch SOS request
  const { data: sos, error: sosErr } = await supabase
    .from("sos_requests")
    .select("id, circle_id, requester_id, status")
    .eq("id", sosId)
    .maybeSingle();

  if (sosErr || !sos) {
    return { success: false, error: "SOS request not found." };
  }

  if (sos.status !== "active") {
    return {
      success: false,
      error: "This SOS request is no longer active.",
    };
  }

  // 2. Verify suggester is an approved circle member
  const { data: membership, error: memErr } = await supabase
    .from("circle_members")
    .select("id, status")
    .eq("circle_id", sos.circle_id)
    .eq("user_id", user.id)
    .eq("status", "approved")
    .maybeSingle();

  if (memErr || !membership) {
    return {
      success: false,
      error: "You must be an approved circle member to suggest items.",
    };
  }

  // 3. Verify garment is owned by user and is Available
  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("id, title, owner_id, status")
    .eq("id", itemId)
    .maybeSingle();

  if (itemErr || !item) {
    return { success: false, error: "Garment not found." };
  }

  if (item.owner_id !== user.id) {
    return {
      success: false,
      error: "You can only suggest pieces from your own closet!",
    };
  }

  if (item.status !== "Available") {
    return {
      success: false,
      error: `"${item.title}" is currently marked as ${item.status} and cannot be suggested.`,
    };
  }

  // 4. Check if already suggested
  const { data: existingSuggestion } = await supabase
    .from("sos_suggestions")
    .select("id")
    .eq("sos_id", sosId)
    .eq("item_id", itemId)
    .maybeSingle();

  if (existingSuggestion) {
    return {
      success: false,
      error: `You've already suggested "${item.title}" for this SOS request!`,
    };
  }

  // 5. Insert suggestion
  const { data: suggestion, error: insertErr } = await supabase
    .from("sos_suggestions")
    .insert({
      sos_id: sosId,
      suggester_id: user.id,
      item_id: itemId,
      status: "suggested",
    })
    .select("id")
    .single();

  if (insertErr || !suggestion) {
    console.error("[suggestItemForSos] Insert error:", insertErr);
    return {
      success: false,
      error: insertErr?.message || "Failed to submit item suggestion.",
    };
  }

  // Circle activity feed entry (non-fatal)
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    const suggesterName =
      profile?.full_name ||
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      "A circle bestie";

    await supabase.from("circle_activity").insert({
      circle_id: sos.circle_id,
      actor_id: user.id,
      action_type: "sos_suggestion",
      target_sos_id: sosId,
      target_item_id: itemId,
      message: formatSosSuggestionActivityMessage(suggesterName, item.title),
    });
  } catch (feedErr) {
    console.warn(
      "[suggestItemForSos] Feed activity error (non-fatal):",
      feedErr
    );
  }

  revalidatePath(`/sharedrobe/${sos.circle_id}`);

  return {
    success: true,
    message: `Suggested "${item.title}"! Hopefully it saves the day.`,
    data: { suggestionId: suggestion.id },
  };
}

/**
 * Accepts an SOS suggestion:
 * - Verifies caller is the SOS requester
 * - Updates suggestion status to 'accepted'
 * - Updates parent SOS request status to 'fulfilled'
 * - Automatically generates a standard borrow_request for the suggested piece
 * - Dispatches borrow request notification email to the piece's owner
 */
export async function acceptSosSuggestion(
  suggestionId: string,
  durationIntent: string = "Just for the weekend"
): Promise<ActionResult<{ borrowRequestId: string; suggestionId: string }>> {
  if (!isValidUuid(suggestionId)) {
    return { success: false, error: "Invalid suggestion ID specified." };
  }

  const trimmedDuration =
    typeof durationIntent === "string" && durationIntent.trim().length > 0
      ? durationIntent.trim()
      : "Just for the weekend";

  const resolvedDuration = isValidBorrowDuration(trimmedDuration)
    ? trimmedDuration
    : "Just for the weekend";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: "Your session has expired. Please sign in to accept suggestions.",
    };
  }

  // 1. Fetch suggestion along with parent SOS and item details
  const { data: suggestion, error: sugErr } = await supabase
    .from("sos_suggestions")
    .select(`
      id,
      sos_id,
      suggester_id,
      item_id,
      status,
      sos:sos_requests!inner (
        id,
        requester_id,
        circle_id,
        event_description,
        status
      ),
      item:items!inner (
        id,
        title,
        owner_id,
        status
      )
    `)
    .eq("id", suggestionId)
    .maybeSingle();

  if (sugErr || !suggestion) {
    console.error("[acceptSosSuggestion] Fetch error:", sugErr);
    return { success: false, error: "Suggestion not found." };
  }

  type SosJoinRow = {
    id: string;
    requester_id: string;
    circle_id: string;
    event_description: string;
    status: string;
  };
  type ItemJoinRow = {
    id: string;
    title: string;
    owner_id: string;
    status: string;
  };

  const sos = (Array.isArray(suggestion.sos)
    ? suggestion.sos[0]
    : suggestion.sos) as unknown as SosJoinRow | null;
  const item = (Array.isArray(suggestion.item)
    ? suggestion.item[0]
    : suggestion.item) as unknown as ItemJoinRow | null;

  if (!sos || !item) {
    return {
      success: false,
      error: "Could not load the SOS event or garment record.",
    };
  }

  // 2. Caller must be the SOS requester
  if (sos.requester_id !== user.id) {
    return {
      success: false,
      error: "Only the author of the SOS request can accept suggestions.",
    };
  }

  if (suggestion.status === "accepted") {
    return {
      success: false,
      error: "This suggestion has already been accepted!",
    };
  }

  if (item.status !== "Available") {
    return {
      success: false,
      error: `"${item.title}" is currently ${item.status} and cannot be borrowed.`,
    };
  }

  // 3. Mark suggestion accepted
  const { error: sugUpdateErr } = await supabase
    .from("sos_suggestions")
    .update({
      status: "accepted",
      updated_at: new Date().toISOString(),
    })
    .eq("id", suggestionId);

  if (sugUpdateErr) {
    console.error(
      "[acceptSosSuggestion] Update suggestion error:",
      sugUpdateErr
    );
    return {
      success: false,
      error: "Failed to update suggestion status.",
    };
  }

  // 4. Mark parent SOS request fulfilled
  await supabase
    .from("sos_requests")
    .update({
      status: "fulfilled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", sos.id);

  // 5. Automatically generate standard borrow_request
  let borrowRequestId: string;
  const { data: existingBorrow } = await supabase
    .from("borrow_requests")
    .select("id, status")
    .eq("item_id", item.id)
    .eq("requester_id", user.id)
    .eq("circle_id", sos.circle_id)
    .eq("status", "pending")
    .maybeSingle();

  if (existingBorrow) {
    borrowRequestId = existingBorrow.id;
  } else {
    const { data: newBorrow, error: borrowErr } = await supabase
      .from("borrow_requests")
      .insert({
        item_id: item.id,
        requester_id: user.id,
        circle_id: sos.circle_id,
        status: "pending",
        duration_intent: resolvedDuration,
      })
      .select("id")
      .single();

    if (borrowErr || !newBorrow) {
      console.error(
        "[acceptSosSuggestion] Create borrow request error:",
        borrowErr
      );
      return {
        success: false,
        error: "Accepted suggestion, but failed to generate the borrow request.",
      };
    }
    borrowRequestId = newBorrow.id;
  }

  // 6. Non-fatal Resend notification email to the garment owner
  let notificationSent = false;
  try {
    const [{ data: ownerProfile }, { data: circleData }, { data: requesterProfile }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", item.owner_id)
          .maybeSingle(),
        supabase
          .from("circles")
          .select("name")
          .eq("id", sos.circle_id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

    if (ownerProfile?.email) {
      const origin = await getRequestOrigin();
      const requesterName =
        requesterProfile?.full_name ||
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        "A circle bestie";

      const emailRes = await sendBorrowRequestEmail({
        ownerEmail: ownerProfile.email,
        ownerName: ownerProfile.full_name || "Closet Icon",
        requesterName,
        itemTitle: item.title,
        circleName: circleData?.name || "Your Circle",
        durationIntent: resolvedDuration,
        appUrl: origin,
      });

      notificationSent = emailRes.success;
    }
  } catch (emailErr) {
    console.warn("[acceptSosSuggestion] Email notification warning:", emailErr);
  }

  revalidatePath("/sharedrobe");
  revalidatePath(`/sharedrobe/${sos.circle_id}`);
  revalidatePath(`/items/${item.id}`);

  return {
    success: true,
    message: `Suggestion accepted! A borrow request for "${item.title}" has been sent to its owner.`,
    notificationSent,
    data: {
      borrowRequestId,
      suggestionId,
    },
  };
}


