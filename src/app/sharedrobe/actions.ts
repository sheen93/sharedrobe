"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import {
  sendFriendRequestEmail,
  sendCircleJoinRequestEmail,
} from "@/utils/email/resend";

export type ActionResult<T = unknown> =
  | { success: true; message: string; data?: T; notificationSent?: boolean }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(id: unknown): id is string {
  return typeof id === "string" && UUID_REGEX.test(id.trim());
}

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

  revalidatePath("/sharedrobe");
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

  revalidatePath("/sharedrobe");
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

