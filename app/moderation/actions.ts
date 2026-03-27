"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { isOwnerEmail } from "@/lib/ownerAccess";

async function ensureOwner() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) redirect("/sign-in");
  const { data: ownerAdmin } = await supabase
    .from("owner_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!ownerAdmin && !isOwnerEmail(user.email)) redirect("/account");
  return { supabase, user };
}

export async function updateMessageFlagStatus(formData: FormData) {
  const { supabase } = await ensureOwner();
  const flagId = String(formData.get("flag_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!flagId || !status) redirect("/moderation?error=invalid_input");

  const { error } = await supabase.from("message_moderation_flags").update({ status }).eq("id", flagId);
  if (error) redirect(`/moderation?error=${encodeURIComponent(error.message)}`);
  redirect("/moderation?saved=1");
}

export async function resolveAppeal(formData: FormData) {
  const { supabase } = await ensureOwner();
  const userId = String(formData.get("user_id") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  if (!userId || !decision) redirect("/moderation?error=invalid_input");

  if (decision === "approve") {
    const { error } = await supabase
      .from("accounts")
      .update({
        appeal_requested: false,
        blacklisted: false,
        conduct_strikes: 0,
        messaging_suspended_until: null,
        feedback_suspended_until: null,
        manuscript_conduct_strikes: 0,
        manuscript_suspended_until: null,
        manuscript_blacklisted: false,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    if (error) redirect(`/moderation?error=${encodeURIComponent(error.message)}`);
    redirect("/moderation?saved=1");
  }

  const { error } = await supabase
    .from("accounts")
    .update({
      appeal_requested: false,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (error) redirect(`/moderation?error=${encodeURIComponent(error.message)}`);
  redirect("/moderation?saved=1");
}
