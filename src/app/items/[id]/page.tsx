import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { isValidUuid } from "@/app/items/constants";
import ItemDetailClient, {
  type ItemDetailData,
  type FriendOption,
} from "./ItemDetailClient";

export const dynamic = "force-dynamic";

interface ItemPageProps {
  params: Promise<{ id: string }>;
}

export default async function ItemDetailPage({ params }: ItemPageProps) {
  const { id } = await params;

  if (!isValidUuid(id)) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 1. Fetch item with borrower profile
  const { data: itemData, error: itemErr } = await supabase
    .from("items")
    .select(`
      id,
      owner_id,
      title,
      category,
      image_url,
      tags,
      status,
      borrowed_by,
      created_at,
      borrower:borrowed_by (
        id,
        full_name,
        email
      )
    `)
    .eq("id", id)
    .maybeSingle();

  if (itemErr || !itemData) {
    if (itemErr) {
      console.error("[ItemDetailPage] Error fetching item:", itemErr);
    }
    notFound();
  }

  const isOwner = user.id === itemData.owner_id;

  // 2. Fetch owner profile
  let ownerName = "Drobe Member";
  if (itemData.owner_id) {
    if (isOwner) {
      ownerName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email ||
        "You";
    } else {
      const { data: ownerProfile } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", itemData.owner_id)
        .maybeSingle();

      if (ownerProfile) {
        ownerName =
          ownerProfile.full_name || ownerProfile.email || "Drobe Member";
      }
    }
  }

  // 2. If owner, fetch connected friends to populate the "Lent Out" borrower dropdown
  const friendsList: FriendOption[] = [];
  if (isOwner) {
    const { data: friendshipsData } = await supabase
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

    interface DbFriendshipRow {
      requester_id: string;
      addressee_id: string;
      requester: { id: string; full_name: string | null; email: string } | null;
      addressee: { id: string; full_name: string | null; email: string } | null;
    }

    const friendships = (friendshipsData as unknown as DbFriendshipRow[]) || [];
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
  }

  interface ProfileRef {
    id: string;
    full_name: string | null;
    email: string;
  }

  const borrower = itemData.borrower as unknown as ProfileRef | null;

  const item: ItemDetailData = {
    id: itemData.id,
    ownerId: itemData.owner_id || "",
    title: itemData.title,
    category: itemData.category,
    imageUrl: itemData.image_url,
    tags: Array.isArray(itemData.tags) ? itemData.tags : [],
    status:
      (itemData.status as "Available" | "Lent Out" | "In Laundry") || "Available",
    borrowedBy: itemData.borrowed_by,
    borrowerName: borrower?.full_name || borrower?.email || null,
    ownerName,
    createdAt: itemData.created_at,
  };

  return (
    <ItemDetailClient
      item={item}
      friends={friendsList}
      isOwner={isOwner}
      currentUserId={user.id}
    />
  );
}
