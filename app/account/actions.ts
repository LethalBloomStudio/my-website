"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

function calculateAge(dob: string) {
  const birth = new Date(`${dob}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export async function updateAccount(formData: FormData) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) redirect("/sign-in");

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const dob = String(formData.get("dob") ?? "").trim();
  const userMetadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const metadataConsent = typeof userMetadata.parental_consent === "boolean" ? userMetadata.parental_consent : null;

  const { data: existingAccount } = await supabase
    .from("accounts")
    .select("parental_consent")
    .eq("user_id", user.id)
    .maybeSingle();

  const parentalConsent =
    typeof existingAccount?.parental_consent === "boolean"
      ? existingAccount.parental_consent
      : metadataConsent;

  if (!email) redirect("/account?error=email_required");
  if (!dob) redirect("/account?error=dob_required");

  const age = calculateAge(dob);
  if (Number.isNaN(age) || age < 13) {
    redirect("/account?error=age_restricted");
  }

  const ageCategory = age < 18 ? "youth_13_17" : "adult_18_plus";
  if (ageCategory === "youth_13_17" && !parentalConsent) {
    redirect("/account?error=parental_consent_required");
  }
  const payload = {
    user_id: user.id,
    full_name: fullName,
    email,
    dob,
    age_category: ageCategory,
    parental_consent: parentalConsent,
    last_active_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("accounts").upsert(payload);
  if (error) {
    redirect(`/account?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/account?saved=1");
}

export async function requestAppeal() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) redirect("/sign-in");

  const { error } = await supabase
    .from("accounts")
    .update({
      appeal_requested: true,
      updated_at: new Date().toISOString(),
      last_active_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    redirect(`/account?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/account?appeal=requested");
}
