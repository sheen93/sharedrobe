import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import ProfileClient from "./ProfileClient";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const initialFullName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.email ? user.email.split("@")[0] : "");

  return (
    <ProfileClient
      initialFullName={initialFullName}
      email={user.email ?? ""}
      updatedAt={user.updated_at}
    />
  );
}
