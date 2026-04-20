"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { computeProfileComplete } from "@/lib/profileCompletion";

function csvToArray(v: string) {
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function readMultiValue(formData: FormData, key: string) {
  const values = formData.getAll(key).map((v) => String(v).trim()).filter(Boolean);
  if (values.length > 0) return values;
  return csvToArray(String(formData.get(key) ?? ""));
}

export async function updateProfile(formData: FormData) {
  const supabase = await supabaseServer();

  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) redirect("/sign-in");

  const usernameRaw = String(formData.get("username") ?? "").trim().toLowerCase();

  if (usernameRaw && !/^[a-z0-9_]{3,20}$/.test(usernameRaw)) {
    redirect("/settings/profile?error=username");
  }

  // Check if adult so we know whether to save social fields
  const { data: acct } = await supabase.from("accounts").select("age_category").eq("user_id", user.id).maybeSingle();
  const isAdult = (acct as { age_category?: string } | null)?.age_category === "adult_18_plus";

  const is_public = true;
  const penName = String(formData.get("pen_name") ?? "").trim();
  const writerLevel = String(formData.get("writer_level") ?? "bloom");
  const betaReaderLevel = String(formData.get("beta_reader_level") ?? "bloom");
  const feedbackPreference = String(formData.get("feedback_preference") ?? "gentle");
  const writesGenres = readMultiValue(formData, "writes_genres");
  const readsGenres = readMultiValue(formData, "reads_genres");
  const publishingGoals = String(formData.get("publishing_goals") ?? "");
  const feedbackAreas = String(formData.get("feedback_areas") ?? "");

  // Fetch existing profile so we never overwrite with blank if the form loaded without data
  const { data: existing } = await supabase
    .from("public_profiles")
    .select("avatar_url, banner_url, bio, pen_name")
    .eq("user_id", user.id)
    .maybeSingle();
  const existingRow = existing as { avatar_url?: string | null; banner_url?: string | null; bio?: string | null; pen_name?: string | null } | null;

  const rawAvatarUrl = String(formData.get("avatar_url") ?? "").trim();
  const rawBannerUrl = String(formData.get("banner_url") ?? "").trim();
  const rawBio = String(formData.get("bio") ?? "");

  const payload = {
    user_id: user.id,

    // Only set these if provided so blanks don't overwrite existing values
    ...(usernameRaw ? { username: usernameRaw } : {}),

    pen_name: penName || existingRow?.pen_name || "",
    bio: rawBio || existingRow?.bio || "",
    // Never wipe avatar/banner with empty — fall back to existing DB value
    avatar_url: rawAvatarUrl || existingRow?.avatar_url || "",
    banner_url: rawBannerUrl || existingRow?.banner_url || null,

    writer_level: writerLevel,
    beta_reader_level: betaReaderLevel,
    feedback_preference: feedbackPreference,
    publishing_goals: publishingGoals,
    feedback_areas: feedbackAreas,
    feedback_strengths: readMultiValue(formData, "feedback_strengths").join(", "),

    writes_genres: writesGenres,
    reads_genres: readsGenres,

    profile_complete: computeProfileComplete({
      pen_name: penName,
      writer_level: writerLevel as "bloom" | "forge" | "lethal",
      beta_reader_level: betaReaderLevel as "bloom" | "forge" | "lethal",
      feedback_style: feedbackPreference as "gentle" | "balanced" | "direct",
      genres_write: writesGenres,
      genres_read: readsGenres,
      publishing_goals: publishingGoals,
      feedback_areas: feedbackAreas,
    }),

    is_public,
    updated_at: new Date().toISOString(),

    // Social links - adults only; strip leading @ and whitespace
    ...(isAdult ? {
      social_tiktok: String(formData.get("social_tiktok") ?? "").trim().replace(/^@/, "") || null,
      social_instagram: String(formData.get("social_instagram") ?? "").trim().replace(/^@/, "") || null,
      social_facebook: String(formData.get("social_facebook") ?? "").trim().replace(/^@/, "") || null,
      social_x: String(formData.get("social_x") ?? "").trim().replace(/^@/, "") || null,
      social_snapchat: String(formData.get("social_snapchat") ?? "").trim().replace(/^@/, "") || null,
    } : {}),
  };

  const { error } = await supabase.from("public_profiles").upsert(payload);

  if (error) {
    redirect(`/settings/profile?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/profile");
  if (usernameRaw) revalidatePath(`/u/${usernameRaw}`);
  redirect(`/profile?updated=${Date.now()}`);
}
