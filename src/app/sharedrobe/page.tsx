import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import SharedrobeClient, {
  type UserCircleData,
  type UserFriendData,
  type PendingFriendRequestData,
  type OutgoingFriendRequestData,
  type PendingCircleRequestData,
  type CircleItemPreview,
  type CircleMemberSummary,
} from "./SharedrobeClient";

export const dynamic = "force-dynamic";

interface DbMembershipRow {
  id: string;
  circle_id: string;
  role: string;
  status: string;
  created_at: string;
  circle: {
    id: string;
    name: string;
    description: string | null;
    created_by: string;
    created_at: string;
  } | null;
}

interface DbFriendshipRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  created_at: string;
  requester: { id: string; full_name: string | null; email: string } | null;
  addressee: { id: string; full_name: string | null; email: string } | null;
}

interface DbCircleRequestRow {
  id: string;
  circle_id: string;
  user_id: string;
  status: string;
  created_at: string;
  circle: { id: string; name: string } | null;
  profile: { id: string; full_name: string | null; email: string } | null;
}

export default async function ShareDrobePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 1. Fetch user's circles & memberships
  const { data: userMemberships } = await supabase
    .from("circle_members")
    .select(`
      id,
      circle_id,
      role,
      status,
      created_at,
      circle:circle_id (
        id,
        name,
        description,
        created_by,
        created_at
      )
    `)
    .eq("user_id", user.id);

  const memberships = (userMemberships as unknown as DbMembershipRow[]) || [];
  const circleIds = memberships.map((m) => m.circle_id);

  // 2. Fetch member counts, user IDs, and approved member profiles for these circles
  const memberCounts: Record<string, number> = {};
  const circleMembersMap: Record<string, string[]> = {};
  const circleMembersDetailsMap: Record<string, CircleMemberSummary[]> = {};

  if (circleIds.length > 0) {
    interface DbCircleMemberRow {
      id: string;
      circle_id: string;
      user_id: string;
      role: string;
      status: string;
      profile: {
        id: string;
        full_name: string | null;
        email: string;
      } | null;
    }

    const { data: memberRowsData } = await supabase
      .from("circle_members")
      .select(`
        id,
        circle_id,
        user_id,
        role,
        status,
        profile:user_id (
          id,
          full_name,
          email
        )
      `)
      .in("circle_id", circleIds)
      .order("role", { ascending: true })
      .order("created_at", { ascending: true });

    const memberRows =
      (memberRowsData as unknown as DbCircleMemberRow[]) || [];

    memberRows.forEach((row) => {
      if (row.status === "approved") {
        memberCounts[row.circle_id] = (memberCounts[row.circle_id] || 0) + 1;
        if (!circleMembersDetailsMap[row.circle_id]) {
          circleMembersDetailsMap[row.circle_id] = [];
        }
        if (row.profile) {
          circleMembersDetailsMap[row.circle_id].push({
            membershipId: row.id,
            userId: row.user_id,
            fullName:
              row.profile.full_name ||
              row.profile.email.split("@")[0] ||
              "Drobe Member",
            email: row.profile.email,
            role: row.role === "admin" ? "admin" : "member",
            isCurrentUser: row.user_id === user.id,
          });
        }
      }
      if (!circleMembersMap[row.circle_id]) {
        circleMembersMap[row.circle_id] = [];
      }
      circleMembersMap[row.circle_id].push(row.user_id);
    });
  }

  // 3. Fetch shared items in these circles
  let circleItemsMap: Record<string, CircleItemPreview[]> = {};

  if (circleIds.length > 0) {
    const { data: circleItemRows } = await supabase
      .from("circle_items")
      .select(`
        id,
        circle_id,
        item_id,
        shared_by,
        items:item_id (
          id,
          title,
          category,
          image_url,
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
      .in("circle_id", circleIds);

    interface DbItemRef {
      id: string;
      title: string;
      category: string;
      image_url: string;
      owner_id: string;
      status: string | null;
      borrowed_by: string | null;
      borrower: { id: string; full_name: string | null; email: string } | null;
    }

    if (circleItemRows) {
      circleItemsMap = circleItemRows.reduce<Record<string, CircleItemPreview[]>>(
        (acc, row) => {
          if (!acc[row.circle_id]) acc[row.circle_id] = [];
          if (row.items && !Array.isArray(row.items)) {
            const rawItem = row.items as unknown as DbItemRef;
            acc[row.circle_id].push({
              id: rawItem.id,
              title: rawItem.title,
              category: rawItem.category,
              image_url: rawItem.image_url,
              owner_id: rawItem.owner_id,
              status: rawItem.status || "Available",
              borrowed_by: rawItem.borrowed_by,
              borrowerName:
                rawItem.borrower?.full_name || rawItem.borrower?.email || null,
            });
          }
          return acc;
        },
        {}
      );
    }
  }

  // Format initial circles
  const initialCircles: UserCircleData[] = memberships
    .filter((m): m is DbMembershipRow & { circle: NonNullable<DbMembershipRow["circle"]> } =>
      Boolean(m.circle)
    )
    .map((m) => ({
      id: m.circle.id,
      name: m.circle.name,
      description: m.circle.description,
      role: m.role as "admin" | "member",
      status: m.status as "approved" | "pending",
      memberCount: memberCounts[m.circle.id] || 1,
      sharedItemCount: (circleItemsMap[m.circle.id] || []).length,
      items: circleItemsMap[m.circle.id] || [],
      memberUserIds: circleMembersMap[m.circle.id] || [],
      members: circleMembersDetailsMap[m.circle.id] || [],
    }));

  // 4. Fetch friendships
  const { data: friendshipsData } = await supabase
    .from("friendships")
    .select(`
      id,
      requester_id,
      addressee_id,
      status,
      created_at,
      requester:requester_id (id, full_name, email),
      addressee:addressee_id (id, full_name, email)
    `)
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  const friendships = (friendshipsData as unknown as DbFriendshipRow[]) || [];

  const initialFriends: UserFriendData[] = [];
  const initialIncomingFriendRequests: PendingFriendRequestData[] = [];
  const initialOutgoingFriendRequests: OutgoingFriendRequestData[] = [];

  friendships.forEach((f) => {
    if (f.status === "accepted") {
      const isRequester = f.requester_id === user.id;
      const other = isRequester ? f.addressee : f.requester;
      if (other) {
        initialFriends.push({
          id: other.id,
          friendshipId: f.id,
          fullName: other.full_name || "Drobe Member",
          email: other.email,
          createdAt: f.created_at,
        });
      }
    } else if (f.status === "pending") {
      if (f.addressee_id === user.id && f.requester) {
        initialIncomingFriendRequests.push({
          friendshipId: f.id,
          requesterId: f.requester.id,
          fullName: f.requester.full_name || "Drobe Member",
          email: f.requester.email,
          createdAt: f.created_at,
        });
      } else if (f.requester_id === user.id && f.addressee) {
        initialOutgoingFriendRequests.push({
          friendshipId: f.id,
          addresseeId: f.addressee.id,
          fullName: f.addressee.full_name || "Drobe Member",
          email: f.addressee.email,
          createdAt: f.created_at,
        });
      }
    }
  });

  // 5. Fetch incoming circle member requests (for circles where current user is an admin)
  const adminCircleIds = memberships
    .filter((m) => m.role === "admin" && m.status === "approved")
    .map((m) => m.circle_id);

  const initialIncomingCircleRequests: PendingCircleRequestData[] = [];
  if (adminCircleIds.length > 0) {
    const { data: memberRequestsData } = await supabase
      .from("circle_members")
      .select(`
        id,
        circle_id,
        user_id,
        status,
        created_at,
        circle:circle_id (id, name),
        profile:user_id (id, full_name, email)
      `)
      .in("circle_id", adminCircleIds)
      .eq("status", "pending")
      .neq("user_id", user.id);

    const memberRequests =
      (memberRequestsData as unknown as DbCircleRequestRow[]) || [];

    memberRequests.forEach((r) => {
      if (r.circle && r.profile) {
        initialIncomingCircleRequests.push({
          membershipId: r.id,
          circleId: r.circle.id,
          circleName: r.circle.name,
          requesterId: r.profile.id,
          fullName: r.profile.full_name || "Drobe Member",
          email: r.profile.email,
          createdAt: r.created_at,
        });
      }
    });
  }

  return (
    <SharedrobeClient
      initialCircles={initialCircles}
      initialFriends={initialFriends}
      initialIncomingFriendRequests={initialIncomingFriendRequests}
      initialOutgoingFriendRequests={initialOutgoingFriendRequests}
      initialIncomingCircleRequests={initialIncomingCircleRequests}
    />
  );
}
