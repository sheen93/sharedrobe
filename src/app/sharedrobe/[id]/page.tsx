import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { isValidUuid, type CircleActivityType } from "../constants";
import CircleDetailClient, {
  type CircleMemberProfile,
  type CircleGarmentItem,
  type CircleBorrowRequestItem,
  type CircleActivityItem,
} from "./CircleDetailClient";

export const dynamic = "force-dynamic";

interface CircleDetailPageProps {
  params: Promise<{ id: string }>;
}

interface DbMemberRow {
  id: string;
  user_id: string;
  role: "admin" | "member";
  status: string;
  profile: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
}

interface DbCircleItemRow {
  id: string;
  circle_id: string;
  item_id: string;
  shared_by: string;
  sharer: { id: string; full_name: string | null; email: string } | null;
  items: {
    id: string;
    title: string;
    category: string;
    image_url: string;
    tags: string[] | null;
    owner_id: string;
    status: string | null;
    borrowed_by: string | null;
    borrower: { id: string; full_name: string | null; email: string } | null;
  } | null;
}

interface DbBorrowRequestRow {
  id: string;
  item_id: string;
  requester_id: string;
  circle_id: string;
  status: string;
  duration_intent: string;
  created_at: string;
  item: {
    id: string;
    title: string;
    image_url: string;
    owner_id: string;
  } | null;
  requester: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
}

interface DbCircleActivityRow {
  id: string;
  circle_id: string;
  actor_id: string;
  action_type: CircleActivityType;
  target_item_id: string | null;
  target_outfit_id: string | null;
  message: string | null;
  created_at: string;
  actor: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
  target_item: {
    id: string;
    title: string;
    image_url: string;
  } | null;
}

interface DbCircleOutfitRow {
  id: string;
  creator_id: string;
  circle_id: string | null;
  title: string;
  visibility: string;
  created_at: string;
  outfit_items: {
    item_id: string;
    items:
      | { id: string; title: string; image_url: string; owner_id: string }
      | { id: string; title: string; image_url: string; owner_id: string }[]
      | null;
  }[];
  outfit_votes: {
    voter_id: string;
    vote: "yay" | "nay";
  }[];
}

export default async function CircleDetailPage({
  params,
}: CircleDetailPageProps) {
  const { id: circleId } = await params;

  if (!isValidUuid(circleId)) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 1. Verify circle exists and current user is an approved member
  const [{ data: circle }, { data: myMembership }] = await Promise.all([
    supabase
      .from("circles")
      .select("id, name, description, created_by")
      .eq("id", circleId)
      .maybeSingle(),
    supabase
      .from("circle_members")
      .select("id, role, status")
      .eq("circle_id", circleId)
      .eq("user_id", user.id)
      .eq("status", "approved")
      .maybeSingle(),
  ]);

  if (!circle || !myMembership) {
    redirect("/sharedrobe");
  }

  // 2. Fetch approved circle members, shared items, pending borrow requests, circle_activity, and circle_public outfits in parallel
  const [
    { data: memberRowsData, error: memberErr },
    { data: circleItemsData, error: circleItemsErr },
    { data: borrowRequestsData, error: borrowRequestsErr },
    { data: activityRowsData, error: activityErr },
    { data: circleOutfitsData, error: outfitsErr },
  ] = await Promise.all([
    supabase
      .from("circle_members")
      .select(`
        id,
        user_id,
        role,
        status,
        profile:user_id (
          id,
          full_name,
          email
        )
      `)
      .eq("circle_id", circleId)
      .eq("status", "approved")
      .order("role", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("circle_items")
      .select(`
        id,
        circle_id,
        item_id,
        shared_by,
        sharer:shared_by (
          id,
          full_name,
          email
        ),
        items:item_id (
          id,
          title,
          category,
          image_url,
          tags,
          owner_id,
          status,
          borrowed_by,
          borrower:borrowed_by (
            id,
            full_name,
            email
          )
        )
      `)
      .eq("circle_id", circleId)
      .order("created_at", { ascending: false }),
    supabase
      .from("borrow_requests")
      .select(`
        id,
        item_id,
        requester_id,
        circle_id,
        status,
        duration_intent,
        created_at,
        item:item_id (
          id,
          title,
          image_url,
          owner_id
        ),
        requester:requester_id (
          id,
          full_name,
          email
        )
      `)
      .eq("circle_id", circleId)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("circle_activity")
      .select(`
        id,
        circle_id,
        actor_id,
        action_type,
        target_item_id,
        target_outfit_id,
        message,
        created_at,
        actor:actor_id (
          id,
          full_name,
          email
        ),
        target_item:target_item_id (
          id,
          title,
          image_url
        )
      `)
      .eq("circle_id", circleId)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("outfits")
      .select(`
        id,
        creator_id,
        circle_id,
        title,
        visibility,
        created_at,
        outfit_items (
          item_id,
          items:item_id (
            id,
            title,
            image_url,
            owner_id
          )
        ),
        outfit_votes (
          voter_id,
          vote
        )
      `)
      .eq("circle_id", circleId)
      .eq("visibility", "circle_public")
      .order("created_at", { ascending: false }),
  ]);

  if (memberErr) {
    console.error("[CircleDetailPage] Error fetching circle_members:", memberErr);
  }
  if (circleItemsErr) {
    console.error("[CircleDetailPage] Error fetching circle_items:", circleItemsErr);
  }
  if (borrowRequestsErr) {
    console.error("[CircleDetailPage] Error fetching borrow_requests:", borrowRequestsErr);
  }
  if (activityErr) {
    console.error("[CircleDetailPage] Error fetching circle_activity:", activityErr);
  }
  if (outfitsErr) {
    console.error("[CircleDetailPage] Error fetching circle outfits:", outfitsErr);
  }

  // Format members list (also build a profile lookup map for item owners)
  const memberRows = (memberRowsData as unknown as DbMemberRow[]) || [];
  const profileNameMap = new Map<string, { fullName: string; email: string }>();

  const members: CircleMemberProfile[] = memberRows
    .filter((row): row is DbMemberRow & { profile: NonNullable<DbMemberRow["profile"]> } =>
      Boolean(row.profile)
    )
    .map((row) => {
      const fullName =
        row.profile.full_name || row.profile.email.split("@")[0] || "Drobe Member";
      profileNameMap.set(row.user_id, {
        fullName,
        email: row.profile.email,
      });

      return {
        membershipId: row.id,
        userId: row.user_id,
        fullName,
        email: row.profile.email,
        role: row.role === "admin" ? "admin" : "member",
      };
    });

  // Format shared garments
  const rawCircleItems = (circleItemsData as unknown as DbCircleItemRow[]) || [];
  const items: CircleGarmentItem[] = [];

  rawCircleItems.forEach((row) => {
    if (row.items && !Array.isArray(row.items)) {
      const rawItem = row.items;
      const fallbackOwner = profileNameMap.get(rawItem.owner_id);
      const sharerProfile =
        row.sharer && row.shared_by === rawItem.owner_id ? row.sharer : null;
      const ownerName =
        fallbackOwner?.fullName ||
        sharerProfile?.full_name ||
        sharerProfile?.email?.split("@")[0] ||
        "Circle Member";
      const ownerEmail =
        fallbackOwner?.email || sharerProfile?.email || "";

      items.push({
        id: rawItem.id,
        title: rawItem.title,
        category: rawItem.category,
        image_url: rawItem.image_url,
        tags: Array.isArray(rawItem.tags) ? rawItem.tags : [],
        owner_id: rawItem.owner_id,
        ownerName,
        ownerEmail,
        status: rawItem.status || "Available",
        borrowed_by: rawItem.borrowed_by,
        borrowerName:
          rawItem.borrower?.full_name || rawItem.borrower?.email || null,
      });
    }
  });

  // Format pending borrow requests
  const rawBorrowRequests =
    (borrowRequestsData as unknown as DbBorrowRequestRow[]) || [];
  const pendingBorrowRequests: CircleBorrowRequestItem[] = [];

  rawBorrowRequests.forEach((req) => {
    if (req.item) {
      const requesterName =
        req.requester?.full_name ||
        profileNameMap.get(req.requester_id)?.fullName ||
        req.requester?.email ||
        "Circle Friend";

      pendingBorrowRequests.push({
        id: req.id,
        item_id: req.item_id,
        itemTitle: req.item.title,
        itemImageUrl: req.item.image_url,
        itemOwnerId: req.item.owner_id,
        requester_id: req.requester_id,
        requesterName,
        circle_id: req.circle_id,
        status: req.status,
        duration_intent: req.duration_intent,
        created_at: req.created_at,
      });
    }
  });

  // Build lookup map of shared circle_public outfits
  const rawOutfits = (circleOutfitsData as unknown as DbCircleOutfitRow[]) || [];
  const outfitLookupMap = new Map<
    string,
    NonNullable<CircleActivityItem["targetOutfit"]>
  >();

  for (const oRow of rawOutfits) {
    const pieces: {
      id: string;
      title: string;
      image_url: string;
      owner_id: string;
    }[] = [];

    for (const oi of oRow.outfit_items ?? []) {
      const itemObj = Array.isArray(oi.items) ? oi.items[0] : oi.items;
      if (itemObj && itemObj.id) {
        pieces.push({
          id: itemObj.id,
          title: itemObj.title,
          image_url: itemObj.image_url,
          owner_id: itemObj.owner_id,
        });
      }
    }

    const votes = oRow.outfit_votes ?? [];
    const yayCount = votes.filter((v) => v.vote === "yay").length;
    const nayCount = votes.filter((v) => v.vote === "nay").length;
    const myVoteRow = votes.find((v) => v.voter_id === user.id);

    outfitLookupMap.set(oRow.id, {
      id: oRow.id,
      title: oRow.title,
      creatorId: oRow.creator_id,
      creatorName:
        profileNameMap.get(oRow.creator_id)?.fullName || "Circle Member",
      yayCount,
      nayCount,
      myVote: myVoteRow?.vote ?? null,
      items: pieces,
    });
  }

  // Format chronological activity / drama feed rows
  const rawActivities =
    (activityRowsData as unknown as DbCircleActivityRow[]) || [];
  const referencedOutfitIds = new Set<string>();

  const activities: CircleActivityItem[] = rawActivities.map((act) => {
    const actorName =
      act.actor?.full_name ||
      profileNameMap.get(act.actor_id)?.fullName ||
      act.actor?.email?.split("@")[0] ||
      "Circle Member";

    if (act.target_outfit_id) {
      referencedOutfitIds.add(act.target_outfit_id);
    }

    return {
      id: act.id,
      circle_id: act.circle_id,
      actor_id: act.actor_id,
      actorName,
      action_type: act.action_type,
      target_item_id: act.target_item_id,
      targetItemTitle: act.target_item?.title || null,
      targetItemImageUrl: act.target_item?.image_url || null,
      target_outfit_id: act.target_outfit_id ?? null,
      targetOutfit: act.target_outfit_id
        ? outfitLookupMap.get(act.target_outfit_id) ?? null
        : null,
      message: act.message,
      created_at: act.created_at,
    };
  });

  // Also ensure any circle_public outfit that didn't have an activity row is included in the feed
  for (const oRow of rawOutfits) {
    if (!referencedOutfitIds.has(oRow.id)) {
      const hydratedOutfit = outfitLookupMap.get(oRow.id);
      if (hydratedOutfit) {
        activities.push({
          id: `outfit-activity-${oRow.id}`,
          circle_id: circleId,
          actor_id: oRow.creator_id,
          actorName: hydratedOutfit.creatorName,
          action_type: "shared_outfit",
          target_item_id: null,
          targetItemTitle: null,
          targetItemImageUrl: null,
          target_outfit_id: oRow.id,
          targetOutfit: hydratedOutfit,
          message: `✨ ${hydratedOutfit.creatorName} dropped a new lookbook "${oRow.title}" — cast your Yay or Nay!`,
          created_at: oRow.created_at,
        });
      }
    }
  }

  // Sort combined activities chronologically descending
  activities.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <CircleDetailClient
      circle={{
        id: circle.id,
        name: circle.name,
        description: circle.description,
        createdBy: circle.created_by,
      }}
      currentUserId={user.id}
      currentUserRole={myMembership.role === "admin" ? "admin" : "member"}
      members={members}
      items={items}
      pendingBorrowRequests={pendingBorrowRequests}
      activities={activities}
    />
  );
}
