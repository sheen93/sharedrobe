import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import OutfitBuilderClient, {
  type BuilderCircleOption,
  type BuilderGarmentItem,
  type SavedOutfitSummary,
} from "./OutfitBuilderClient";
import type { OutfitVisibility } from "@/app/outfits/constants";

interface OutfitBuilderPageProps {
  searchParams: Promise<{
    circleId?: string;
    from?: string;
  }>;
}

export default async function OutfitBuilderPage({
  searchParams,
}: OutfitBuilderPageProps) {
  const resolvedSearch = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 1. Fetch current user's profile and personal closet items
  const [{ data: myProfile }, { data: myItemsData }, { data: membershipRows }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("items")
        .select("id, title, category, tags, image_url, owner_id, status")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("circle_members")
        .select(
          `
          circle_id,
          status,
          circles:circle_id (
            id,
            name,
            description
          )
        `
        )
        .eq("user_id", user.id)
        .eq("status", "approved"),
    ]);

  const myDisplayName =
    myProfile?.full_name ||
    myProfile?.email?.split("@")[0] ||
    user.email?.split("@")[0] ||
    "Me";

  const myClosetItems: BuilderGarmentItem[] = (myItemsData ?? []).map(
    (item) => ({
      id: item.id,
      title: item.title,
      category: item.category,
      tags: Array.isArray(item.tags) ? item.tags : [],
      image_url: item.image_url,
      owner_id: item.owner_id,
      ownerName: myDisplayName,
      status: item.status ?? "Available",
      circleId: null,
      circleName: null,
    })
  );

  // 2. Parse approved circles
  const circles: BuilderCircleOption[] = [];
  const circleNameMap = new Map<string, string>();

  for (const row of membershipRows ?? []) {
    const cObj = Array.isArray(row.circles) ? row.circles[0] : row.circles;
    if (cObj && cObj.id) {
      circles.push({
        id: cObj.id,
        name: cObj.name,
        description: cObj.description ?? null,
      });
      circleNameMap.set(cObj.id, cObj.name);
    }
  }

  const approvedCircleIds = circles.map((c) => c.id);

  // 3. Fetch items shared in the user's approved circles (excluding user's own items so 'Circle Closets' showcases friends' closets)
  const circleClosetItems: BuilderGarmentItem[] = [];
  if (approvedCircleIds.length > 0) {
    const { data: rawCircleItems } = await supabase
      .from("circle_items")
      .select(
        `
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
          tags,
          image_url,
          owner_id,
          status
        )
      `
      )
      .in("circle_id", approvedCircleIds)
      .order("created_at", { ascending: false });

    // Collect distinct item owner IDs to hydrate owner names cleanly from profiles
    const ownerIds = new Set<string>();
    for (const row of rawCircleItems ?? []) {
      const itemObj = Array.isArray(row.items) ? row.items[0] : row.items;
      if (itemObj?.owner_id) {
        ownerIds.add(itemObj.owner_id);
      }
    }

    const ownerNameMap = new Map<string, string>();
    if (ownerIds.size > 0) {
      const { data: ownerProfiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", Array.from(ownerIds));

      for (const p of ownerProfiles ?? []) {
        ownerNameMap.set(
          p.id,
          p.full_name || p.email?.split("@")[0] || "Friend"
        );
      }
    }

    const seenCircleItems = new Set<string>();
    for (const row of rawCircleItems ?? []) {
      const itemObj = Array.isArray(row.items) ? row.items[0] : row.items;
      const sharerObj = Array.isArray(row.sharer) ? row.sharer[0] : row.sharer;
      if (!itemObj || !itemObj.id) continue;
      // Show friends' shared items in Circle Closets tab (and avoid duplicates across circles)
      if (itemObj.owner_id === user.id) continue;
      if (seenCircleItems.has(itemObj.id)) continue;
      seenCircleItems.add(itemObj.id);

      const resolvedOwnerName =
        ownerNameMap.get(itemObj.owner_id) ||
        sharerObj?.full_name ||
        sharerObj?.email?.split("@")[0] ||
        "Circle Friend";

      circleClosetItems.push({
        id: itemObj.id,
        title: itemObj.title,
        category: itemObj.category,
        tags: Array.isArray(itemObj.tags) ? itemObj.tags : [],
        image_url: itemObj.image_url,
        owner_id: itemObj.owner_id,
        ownerName: resolvedOwnerName,
        status: itemObj.status ?? "Available",
        circleId: row.circle_id,
        circleName: circleNameMap.get(row.circle_id) ?? null,
      });
    }
  }

  // 4. Fetch user's saved outfits with their items and vote tallies
  const { data: rawSavedOutfits } = await supabase
    .from("outfits")
    .select(
      `
      id,
      title,
      visibility,
      circle_id,
      created_at,
      outfit_items (
        item_id,
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
        vote
      )
    `
    )
    .eq("creator_id", user.id)
    .order("created_at", { ascending: false });

  const savedOutfits: SavedOutfitSummary[] = (rawSavedOutfits ?? []).map(
    (outfitRow) => {
      const pieces: BuilderGarmentItem[] = [];
      for (const oi of outfitRow.outfit_items ?? []) {
        const itemObj = Array.isArray(oi.items) ? oi.items[0] : oi.items;
        if (itemObj && itemObj.id) {
          pieces.push({
            id: itemObj.id,
            title: itemObj.title,
            category: itemObj.category,
            tags: Array.isArray(itemObj.tags) ? itemObj.tags : [],
            image_url: itemObj.image_url,
            owner_id: itemObj.owner_id,
            ownerName:
              itemObj.owner_id === user.id ? myDisplayName : "Circle Friend",
            status: itemObj.status ?? "Available",
          });
        }
      }

      const votes = outfitRow.outfit_votes ?? [];
      const yayCount = votes.filter((v) => v.vote === "yay").length;
      const nayCount = votes.filter((v) => v.vote === "nay").length;

      return {
        id: outfitRow.id,
        title: outfitRow.title,
        visibility: (outfitRow.visibility as OutfitVisibility) ?? "private",
        circleId: outfitRow.circle_id ?? null,
        circleName: outfitRow.circle_id
          ? circleNameMap.get(outfitRow.circle_id) ?? null
          : null,
        createdAt: outfitRow.created_at,
        items: pieces,
        yayCount,
        nayCount,
      };
    }
  );

  const initialCircleId =
    typeof resolvedSearch.circleId === "string" &&
    circleNameMap.has(resolvedSearch.circleId)
      ? resolvedSearch.circleId
      : null;

  const backHref =
    typeof resolvedSearch.from === "string" &&
    resolvedSearch.from.startsWith("/")
      ? resolvedSearch.from
      : initialCircleId
      ? `/sharedrobe/${initialCircleId}`
      : "/";

  return (
    <OutfitBuilderClient
      currentUserId={user.id}
      myClosetItems={myClosetItems}
      circleClosetItems={circleClosetItems}
      circles={circles}
      savedOutfits={savedOutfits}
      initialCircleId={initialCircleId}
      backHref={backHref}
    />
  );
}
