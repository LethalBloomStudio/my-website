export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { updateProfile } from "./actions";
import MultiSelectDropdown from "@/components/MultiSelectDropdown";
import ProfileImageUpload from "@/components/ProfileImageUpload";
import LevelSelectWithDescription from "@/components/LevelSelectWithDescription";
import {
  FEEDBACK_PREFERENCE_OPTIONS,
  FEEDBACK_STRENGTH_OPTIONS,
  genreOptionsForAgeCategory,
} from "@/lib/profileOptions";
import ProseTextarea from "@/components/ProseTextarea";

type ProfileData = {
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  pen_name: string | null;
  writer_level: string | null;
  beta_reader_level: string | null;
  feedback_preference: string | null;
  publishing_goals: string | null;
  feedback_areas: string | null;
  feedback_strengths: string | null;
  writes_genres: string[] | null;
  reads_genres: string[] | null;
  social_tiktok: string | null;
  social_facebook: string | null;
  social_instagram: string | null;
  social_x: string | null;
  social_snapchat: string | null;
};

export default async function ProfileAccountPage({
  searchParams,
}: {
  searchParams?: Promise<{ saved?: string; error?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const supabase = await supabaseServer();

  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) redirect("/sign-in");

  const { data, error } = await supabase
    .from("public_profiles")
    .select(
      [
        "username",
        "bio",
        "avatar_url",
        "banner_url",
        "is_public",
        "pen_name",
        "writer_level",
        "beta_reader_level",
        "feedback_preference",
        "publishing_goals",
        "feedback_areas",
        "feedback_strengths",
        "writes_genres",
        "reads_genres",
        "social_tiktok",
        "social_facebook",
        "social_instagram",
        "social_x",
        "social_snapchat",
      ].join(",")
    )
    .eq("user_id", user.id)
    .maybeSingle();
  const profile = data as ProfileData | null;
  const { data: account } = await supabase
    .from("accounts")
    .select("age_category")
    .eq("user_id", user.id)
    .maybeSingle();
  const genreOptions = genreOptionsForAgeCategory(
    (account as { age_category?: string | null } | null)?.age_category
  );
  const sortedGenreOptions = [...genreOptions].sort((a, b) => a.localeCompare(b));
  const feedbackStrengthValues = (profile?.feedback_strengths ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (error && error.code !== "PGRST116") {
    return (
      <main className="p-10 text-white">
        Failed to load profile: {error.message}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Edit profile</h1>

        {params.saved ? (
          <div className="mt-6 rounded-xl border border-emerald-900 bg-emerald-950/40 p-4 text-sm text-emerald-200">
            Saved.
          </div>
        ) : null}

        {params.error ? (
          <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">
            {params.error === "username"
              ? "Username must be 3-20 chars: lowercase letters, numbers, underscore."
              : decodeURIComponent(params.error)}
          </div>
        ) : null}

        <div className="mt-8">
          <form action={updateProfile} className="space-y-5">
            <section className="rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-5">
              <h2 className="text-lg font-semibold">Profile Picture</h2>
              <p className="mt-1 text-sm text-neutral-300">This appears on your public profile.</p>
              <p className="mt-1 text-xs text-neutral-500">Recommended: 400 × 400 px or larger, square. JPG, PNG, or WebP.</p>
              <div className="mt-4">
                <ProfileImageUpload initialUrl={profile?.avatar_url ?? ""} name="avatar_url" autoSave />
              </div>
            </section>

            <section className="rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-5">
              <h2 className="text-lg font-semibold">Profile Banner</h2>
              <p className="mt-1 text-sm text-neutral-300">A wide background image displayed behind your name at the top of your profile.</p>
              <p className="mt-1 text-xs text-neutral-500">Recommended: 1500 × 350 px or larger (4:1 ratio). JPG, PNG, or WebP.</p>
              <div className="mt-4">
                <ProfileImageUpload
                  initialUrl={profile?.banner_url ?? ""}
                  name="banner_url"
                  bucket="avatars"
                  uploadButtonLabel="Upload banner"
                  previewAlt="Banner preview"
                  autoSave
                />
              </div>
            </section>

            <section className="space-y-5 rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-5">
              <h2 className="text-lg font-semibold">Basic Profile</h2>

              <label className="block">
                <div className="text-sm text-neutral-300">Pen name</div>
                <input
                  name="pen_name"
                  defaultValue={profile?.pen_name ?? ""}
                  className="mt-2 w-full rounded-lg border border-[rgba(120,120,120,0.45)] bg-neutral-900/40 px-4 py-3 text-neutral-100"
                />
              </label>

              <label className="block">
                <div className="text-sm text-neutral-300">Username</div>
                <input
                  name="username"
                  defaultValue={profile?.username ?? ""}
                  className="mt-2 w-full rounded-lg border border-[rgba(120,120,120,0.45)] bg-neutral-900/40 px-4 py-3 text-neutral-100"
                  placeholder="lethal_writer"
                />
                <p className="mt-2 text-xs text-neutral-500">Public link: /u/username</p>
              </label>

              <label className="block">
                <div className="text-sm text-neutral-300">Bio</div>
                <ProseTextarea
                  name="bio"
                  defaultValue={profile?.bio ?? ""}
                  rows={5}
                  className="mt-2 w-full rounded-lg border border-[rgba(120,120,120,0.45)] bg-neutral-900/40 px-4 py-3 text-neutral-100"
                />
              </label>
            </section>

            <section className="space-y-5 rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-5">
              <h2 className="text-lg font-semibold">Writer Profile</h2>

              <LevelSelectWithDescription
                name="writer_level"
                label="Writer level"
                defaultValue={profile?.writer_level ?? "bloom"}
                mode="writer"
              />

              <label className="block">
                <div className="text-sm text-neutral-300">Genres you write</div>
                <div className="mt-2">
                  <MultiSelectDropdown
                    name="writes_genres"
                    options={sortedGenreOptions.map((g) => ({ value: g, label: g }))}
                    defaultValues={profile?.writes_genres ?? []}
                    placeholder="Select genres"
                  />
                </div>
              </label>

              <label className="block">
                <div className="text-sm text-neutral-300">Publishing goals</div>
                <ProseTextarea
                  name="publishing_goals"
                  defaultValue={profile?.publishing_goals ?? ""}
                  rows={3}
                  className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3 text-neutral-100"
                />
              </label>

              <label className="block">
                <div className="text-sm text-neutral-300">Areas you&apos;d like feedback</div>
                <ProseTextarea
                  name="feedback_areas"
                  defaultValue={profile?.feedback_areas ?? ""}
                  rows={3}
                  className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3 text-neutral-100"
                />
              </label>

              <label className="block">
                <div className="text-sm text-neutral-300">Feedback style preferred</div>
                <select
                  name="feedback_preference"
                  defaultValue={profile?.feedback_preference ?? "gentle"}
                  className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3 text-neutral-100"
                >
                  {FEEDBACK_PREFERENCE_OPTIONS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section className="space-y-5 rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-5">
              <h2 className="text-lg font-semibold">Reader Profile</h2>

              <LevelSelectWithDescription
                name="beta_reader_level"
                label="Reader level"
                defaultValue={profile?.beta_reader_level ?? "bloom"}
                mode="reader"
              />

              <label className="block">
                <div className="text-sm text-neutral-300">Genres you like to read</div>
                <div className="mt-2">
                  <MultiSelectDropdown
                    name="reads_genres"
                    options={sortedGenreOptions.map((g) => ({ value: g, label: g }))}
                    defaultValues={profile?.reads_genres ?? []}
                    placeholder="Select genres"
                  />
                </div>
              </label>

              <label className="block">
                <div className="text-sm text-neutral-300">Feedback strengths</div>
                <div className="mt-2">
                  <MultiSelectDropdown
                    name="feedback_strengths"
                    options={FEEDBACK_STRENGTH_OPTIONS.map((s) => ({ value: s, label: s }))}
                    defaultValues={feedbackStrengthValues}
                    placeholder="Select strengths"
                  />
                </div>
              </label>
            </section>

            {(account as { age_category?: string | null } | null)?.age_category === "adult_18_plus" && (
              <section className="space-y-5 rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-5">
                <div>
                  <h2 className="text-lg font-semibold">Social Media</h2>
                  <p className="mt-1 text-sm text-neutral-400">Optional. Enter your handle (without @) so readers can find you.</p>
                </div>

                <label className="block">
                  <div className="flex items-center gap-2 text-sm text-neutral-300">
                    <span>TikTok</span>
                    <span className="text-xs text-neutral-500">tiktok.com/@handle</span>
                  </div>
                  <div className="mt-2 flex items-center rounded-lg border border-[rgba(120,120,120,0.45)] bg-neutral-900/40 focus-within:border-[rgba(120,120,120,0.7)]">
                    <span className="px-3 text-neutral-500 text-sm select-none">@</span>
                    <input
                      name="social_tiktok"
                      defaultValue={profile?.social_tiktok ?? ""}
                      placeholder="yourhandle"
                      className="flex-1 bg-transparent py-3 pr-4 text-neutral-100 focus:outline-none text-sm"
                    />
                  </div>
                </label>

                <label className="block">
                  <div className="flex items-center gap-2 text-sm text-neutral-300">
                    <span>Instagram</span>
                    <span className="text-xs text-neutral-500">instagram.com/handle</span>
                  </div>
                  <div className="mt-2 flex items-center rounded-lg border border-[rgba(120,120,120,0.45)] bg-neutral-900/40 focus-within:border-[rgba(120,120,120,0.7)]">
                    <span className="px-3 text-neutral-500 text-sm select-none">@</span>
                    <input
                      name="social_instagram"
                      defaultValue={profile?.social_instagram ?? ""}
                      placeholder="yourhandle"
                      className="flex-1 bg-transparent py-3 pr-4 text-neutral-100 focus:outline-none text-sm"
                    />
                  </div>
                </label>

                <label className="block">
                  <div className="flex items-center gap-2 text-sm text-neutral-300">
                    <span>Facebook</span>
                    <span className="text-xs text-neutral-500">facebook.com/handle</span>
                  </div>
                  <div className="mt-2 flex items-center rounded-lg border border-[rgba(120,120,120,0.45)] bg-neutral-900/40 focus-within:border-[rgba(120,120,120,0.7)]">
                    <span className="px-3 text-neutral-500 text-sm select-none">fb.com/</span>
                    <input
                      name="social_facebook"
                      defaultValue={profile?.social_facebook ?? ""}
                      placeholder="yourhandle"
                      className="flex-1 bg-transparent py-3 pr-4 text-neutral-100 focus:outline-none text-sm"
                    />
                  </div>
                </label>

                <label className="block">
                  <div className="flex items-center gap-2 text-sm text-neutral-300">
                    <span>X / Twitter</span>
                    <span className="text-xs text-neutral-500">x.com/@handle</span>
                  </div>
                  <div className="mt-2 flex items-center rounded-lg border border-[rgba(120,120,120,0.45)] bg-neutral-900/40 focus-within:border-[rgba(120,120,120,0.7)]">
                    <span className="px-3 text-neutral-500 text-sm select-none">@</span>
                    <input
                      name="social_x"
                      defaultValue={profile?.social_x ?? ""}
                      placeholder="yourhandle"
                      className="flex-1 bg-transparent py-3 pr-4 text-neutral-100 focus:outline-none text-sm"
                    />
                  </div>
                </label>

                <label className="block">
                  <div className="flex items-center gap-2 text-sm text-neutral-300">
                    <span>Snapchat</span>
                    <span className="text-xs text-neutral-500">snapchat.com/add/handle</span>
                  </div>
                  <div className="mt-2 flex items-center rounded-lg border border-[rgba(120,120,120,0.45)] bg-neutral-900/40 focus-within:border-[rgba(120,120,120,0.7)]">
                    <span className="px-3 text-neutral-500 text-sm select-none">@</span>
                    <input
                      name="social_snapchat"
                      defaultValue={profile?.social_snapchat ?? ""}
                      placeholder="yourhandle"
                      className="flex-1 bg-transparent py-3 pr-4 text-neutral-100 focus:outline-none text-sm"
                    />
                  </div>
                </label>
              </section>
            )}

            <button className="inline-flex h-12 items-center justify-center rounded-lg bg-neutral-100 px-6 text-sm font-medium text-neutral-950 transition hover:bg-neutral-200">
              Save changes
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
