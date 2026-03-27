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

export async function updateManuscriptBlurb(manuscriptId: string, blurb: string) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) redirect("/sign-in");

  await supabase
    .from("manuscripts")
    .update({ description: blurb })
    .eq("id", manuscriptId)
    .eq("owner_id", user.id);

  revalidatePath("/profile");
}

export async function setHighlightedManuscript(manuscriptId: string | null) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) redirect("/sign-in");

  await supabase
    .from("public_profiles")
    .update({ highlighted_manuscript_id: manuscriptId })
    .eq("user_id", user.id);

  revalidatePath("/profile");
}

export async function updatePublicProfile(formData: FormData) {
  const supabase = await supabaseServer();

  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) redirect("/sign-in");

  const is_public = true;

  const penName = String(formData.get("pen_name") ?? "").trim();
  const avatarUrl = String(formData.get("avatar_url") ?? "").trim();
  const writerLevel = String(formData.get("writer_level") ?? "bloom");
  const betaReaderLevel = String(formData.get("beta_reader_level") ?? "bloom");
  const feedbackPreference = String(formData.get("feedback_preference") ?? "gentle");
  const writesGenres = readMultiValue(formData, "writes_genres");
  const readsGenres = readMultiValue(formData, "reads_genres");
  const publishingGoals = String(formData.get("publishing_goals") ?? "");
  const feedbackAreas = String(formData.get("feedback_areas") ?? "");

  const payload = {
    user_id: user.id,

    pen_name: penName,
    avatar_url: avatarUrl,
    bio: String(formData.get("bio") ?? ""),

    writer_level: writerLevel,
    writes_genres: writesGenres,
    publishing_goals: publishingGoals,
    feedback_areas: feedbackAreas,
    feedback_preference: feedbackPreference,

    reads_genres: readsGenres,
    beta_reader_level: betaReaderLevel,
    feedback_strengths: readMultiValue(formData, "feedback_strengths").join(", "),

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
  };

  const { error } = await supabase.from("public_profiles").upsert(payload);

  if (error) {
    redirect(`/profile?error=${encodeURIComponent(error.message)}`);
  }

  const { data: updatedProfile } = await supabase
    .from("public_profiles")
    .select("username")
    .eq("user_id", user.id)
    .maybeSingle();

  const username = (updatedProfile as { username?: string | null } | null)?.username;
  revalidatePath("/profile");
  if (username) {
    revalidatePath(`/u/${username}`);
    redirect(`/u/${username}`);
  }
  redirect(`/profile?updated=${Date.now()}`);
}
