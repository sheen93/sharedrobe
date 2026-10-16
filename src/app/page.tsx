import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import MyDrobeClient, { type WardrobeItem } from "./MyDrobeClient";

export const dynamic = "force-dynamic";

interface DbItemWithShares {
  id: string;
  title: string;
  category: string;
  tags: string[] | null;
  image_url: string;
  owner_id: string;
  created_at: string;
  circle_items: Array<{ circle_id: string }> | null;
}

export default async function MyDrobePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: rawItems, error } = await supabase
    .from("items")
    .select(`
      id,
      title,
      category,
      tags,
      image_url,
      owner_id,
      created_at,
      circle_items (
        circle_id
      )
    `)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[MyDrobePage] Failed to fetch items:", error);
  }

  const items = (rawItems as unknown as DbItemWithShares[]) || [];

  const initialItems: WardrobeItem[] = items.map((item) => ({
    id: item.id,
    title: item.title,
    category: item.category,
    tags: item.tags || [],
    image_url: item.image_url,
    owner_id: item.owner_id,
    created_at: item.created_at,
    sharedCirclesCount: (item.circle_items || []).length,
  }));

  return <MyDrobeClient initialItems={initialItems} userId={user.id} />;
}
