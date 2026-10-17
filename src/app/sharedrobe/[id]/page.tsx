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
  item_id: string;
  shared_by: string;
  items: {
    id: string;
    title: string;
    category: string;
    image_url: string;
    tags: string[] | null;
    owner_id: string;
    status: string | null;
    borrowed_by: string | null;
    owner: { id: string; full_name: string | null; email: string } | null;
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

  // 2. Fetch approved circle members, shared items, pending borrow requests, and chronological circle_activity in parallel
  const [
    { data: memberRowsData },
    { data: circleItemsData },
    { data: borrowRequestsData },
    { data: activityRowsData },
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
        item_id,
        shared_by,
        items:item_id (
          id,
          title,
          category,
          image_url,
          tags,
          owner_id,
          status,
          borrowed_by,
          owner:owner_id (
            id,
            full_name,
            email
          ),
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
  ]);

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
      const ownerName =
        rawItem.owner?.full_name ||
        fallbackOwner?.fullName ||
        rawItem.owner?.email ||
        "Circle Member";
      const ownerEmail =
        rawItem.owner?.email || fallbackOwner?.email || "";

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

  // Format chronological activity / drama feed rows
  const rawActivities =
    (activityRowsData as unknown as DbCircleActivityRow[]) || [];
  const activities: CircleActivityItem[] = rawActivities.map((act) => {
    const actorName =
      act.actor?.full_name ||
      profileNameMap.get(act.actor_id)?.fullName ||
      act.actor?.email?.split("@")[0] ||
      "Circle Member";

    return {
      id: act.id,
      circle_id: act.circle_id,
      actor_id: act.actor_id,
      actorName,
      action_type: act.action_type,
      target_item_id: act.target_item_id,
      targetItemTitle: act.target_item?.title || null,
      targetItemImageUrl: act.target_item?.image_url || null,
      message: act.message,
      created_at: act.created_at,
    };
  });

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
