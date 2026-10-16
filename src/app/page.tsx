import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import MyDrobeClient, { type WardrobeItem } from "./MyDrobeClient";

export const dynamic = "force-dynamic";

export default async function MyDrobePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: items, error } = await supabase
    .from("items")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[MyDrobePage] Failed to fetch items:", error);
  }

  const initialItems: WardrobeItem[] = (items as WardrobeItem[]) || [];

  return <MyDrobeClient initialItems={initialItems} userId={user.id} />;
}
