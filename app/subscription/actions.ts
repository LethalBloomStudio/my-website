"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

export async function subscribePlan(plan: "lethal_member" | "lethal_member_annual") {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("accounts")
    .update({ subscription_status: plan, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/subscription");
  return { success: true };
}

export async function cancelSubscription() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("accounts")
    .update({ subscription_status: "free", updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/subscription");
  return { success: true };
}
