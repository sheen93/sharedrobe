import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import {
  isValidUuid,
  type OutfitVisibility,
  type OutfitVoteType,
} from "@/app/outfits/constants";
import OutfitDetailClient, {
  type OutfitDetailData,
  type OutfitDetailGarment,
} from "./OutfitDetailClient";

export const dynamic = "force-dynamic";

interface OutfitDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}

export default async function OutfitDetailPage({
  params,
  searchParams,
}: OutfitDetailPageProps) {
  const { id: outfitId } = await params;
  const resolvedSearch = await searchParams;

  if (!isValidUuid(outfitId)) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 1. Fetch the outfit with creator, circle, items, and votes
  const { data: outfitRow, error: outfitError } = await supabase
    .from("outfits")
    .select(
      `
      id,
      creator_id,
      circle_id,
      title,
      visibility,
      created_at,
      creator:creator_id (
        id,
        full_name,
        email
      ),
      circle:circle_id (
        id,
        name
      ),
      outfit_items (
        id,
        item_id,
        added_at,
        items:item_id (
          id,
          title,
          category,
          tags,
          image_url,
          owner_id,
          status
        )
      ),
      outfit_votes (
        id,
        voter_id,
        vote
      )
    `
    )
    .eq("id", outfitId)
    .maybeSingle();

  if (outfitError || !outfitRow) {
    notFound();
  }

  const creatorObj = Array.isArray(outfitRow.creator)
    ? outfitRow.creator[0]
    : outfitRow.creator;
  const circleObj = Array.isArray(outfitRow.circle)
    ? outfitRow.circle[0]
    : outfitRow.circle;

  const creatorName =
    creatorObj?.full_name ||
    creatorObj?.email?.split("@")[0] ||
    "Circle Friend";

  // 2. Collect distinct item owner IDs and item IDs to resolve owner names and pending borrow requests
  const ownerIds = new Set<string>();
  const itemIds: string[] = [];

  for (const oi of outfitRow.outfit_items ?? []) {
    const itemObj = Array.isArray(oi.items) ? oi.items[0] : oi.items;
    if (itemObj?.id && itemObj?.owner_id) {
      ownerIds.add(itemObj.owner_id);
      itemIds.push(itemObj.id);
    }
  }

  const [ownerProfilesRes, pendingRequestsRes] = await Promise.all([
    ownerIds.size > 0
      ? supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", Array.from(ownerIds))
      : Promise.resolve({ data: [] }),
    itemIds.length > 0
      ? supabase
          .from("borrow_requests")
          .select("item_id")
          .eq("requester_id", user.id)
          .eq("status", "pending")
          .in("item_id", itemIds)
      : Promise.resolve({ data: [] }),
  ]);

  const ownerNameMap = new Map<string, string>();
  for (const p of ownerProfilesRes.data ?? []) {
    ownerNameMap.set(
      p.id,
      p.full_name || p.email?.split("@")[0] || "Circle Friend"
    );
  }

  const pendingItemIdSet = new Set<string>(
    (pendingRequestsRes.data ?? []).map((r) => r.item_id)
  );

  const hydratedItems: OutfitDetailGarment[] = [];
  for (const oi of outfitRow.outfit_items ?? []) {
    const itemObj = Array.isArray(oi.items) ? oi.items[0] : oi.items;
    if (!itemObj?.id) continue;

    hydratedItems.push({
      id: itemObj.id,
      title: itemObj.title,
      category: itemObj.category,
      tags: Array.isArray(itemObj.tags) ? itemObj.tags : [],
      image_url: itemObj.image_url,
      owner_id: itemObj.owner_id,
      ownerName: ownerNameMap.get(itemObj.owner_id) ?? "Circle Friend",
      status: itemObj.status ?? "Available",
      hasPendingRequest: pendingItemIdSet.has(itemObj.id),
    });
  }

  const votes = outfitRow.outfit_votes ?? [];
  const yayCount = votes.filter((v) => v.vote === "yay").length;
  const nayCount = votes.filter((v) => v.vote === "nay").length;
  const myVoteRow = votes.find((v) => v.voter_id === user.id);

  const outfitData: OutfitDetailData = {
    id: outfitRow.id,
    title: outfitRow.title,
    creatorId: outfitRow.creator_id,
    creatorName,
    circleId: outfitRow.circle_id ?? null,
    circleName: circleObj?.name ?? null,
    visibility: (outfitRow.visibility as OutfitVisibility) ?? "private",
    createdAt: outfitRow.created_at,
    yayCount,
    nayCount,
    myVote: (myVoteRow?.vote as OutfitVoteType) ?? null,
    items: hydratedItems,
  };

  const backHref =
    typeof resolvedSearch.from === "string" &&
    resolvedSearch.from.startsWith("/")
      ? resolvedSearch.from
      : outfitData.circleId
      ? `/sharedrobe/${outfitData.circleId}`
      : "/outfits/builder";

  return (
    <OutfitDetailClient
      outfit={outfitData}
      currentUserId={user.id}
      backHref={backHref}
    />
  );
}
