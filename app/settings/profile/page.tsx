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
  social_threads: string | null;
  social_lemon8: string | null;
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
        "social_threads",
        "social_lemon8",
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
                    <span className="flex h-5 w-5 items-center justify-center rounded-full social-badge social-badge--tiktok shrink-0" aria-hidden="true">
                      <svg viewBox="-2 0 28 24" className="h-3 w-3">
                        <path fill="#EE1D52" transform="translate(1.5,0)" d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.79 1.54V6.78a4.85 4.85 0 01-1.02-.09z"/>
                        <path fill="#69C9D0" transform="translate(-1.5,0)" d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.79 1.54V6.78a4.85 4.85 0 01-1.02-.09z"/>
                        <path fill="#ffffff" d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.79 1.54V6.78a4.85 4.85 0 01-1.02-.09z"/>
                      </svg>
                    </span>
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
                    <span className="flex h-5 w-5 items-center justify-center rounded-full social-badge social-badge--instagram shrink-0" aria-hidden="true">
                      <svg viewBox="0 0 24 24" className="h-3 w-3 fill-white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                    </span>
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
                    <span className="flex h-5 w-5 items-center justify-center rounded-full social-badge social-badge--facebook shrink-0" aria-hidden="true">
                      <svg viewBox="0 0 24 24" className="h-3 w-3 fill-white"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.887v2.269h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
                    </span>
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
                    <span className="flex h-5 w-5 items-center justify-center rounded-full social-badge social-badge--x shrink-0" aria-hidden="true">
                      <svg viewBox="0 0 24 24" className="h-3 w-3 fill-white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                    </span>
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
                    <span className="flex h-5 w-5 items-center justify-center rounded-full social-badge social-badge--snapchat shrink-0" aria-hidden="true">
                      <svg viewBox="0 0 24 24" className="h-3 w-3 fill-black"><path d="M12.166.006C9.813-.024 6.318 1.025 4.822 4.543c-.536 1.275-.41 3.44-.41 4.64 0 0-.535.175-.954.175-.437 0-.965-.26-1.02-.26-.273 0-.52.313-.52.626 0 .344.21.61.43.69 1.11.434 1.737.783 2.016 1.62.01.033.164.526.164.526S4.222 13.8 3.74 14.5c-.56.81-1.65 1.41-2.16 1.64-.3.13-.57.38-.57.78 0 .46.42.84 1.01.93l.62.1c.44.07.65.29.65.53 0 .27-.29.54-.29.54s.11.85 2.38 1.15c.1.14.1.41.45.62.36.22 1.2.34 2.02.95.54.4 1.09 1.27 3.99 1.27 2.9 0 3.48-.87 4.02-1.27.82-.61 1.66-.73 2.02-.95.35-.21.35-.48.45-.62 2.27-.3 2.38-1.15 2.38-1.15s-.29-.27-.29-.54c0-.24.21-.46.65-.53l.62-.1c.59-.09 1.01-.47 1.01-.93 0-.4-.27-.65-.57-.78-.51-.23-1.6-.83-2.16-1.64-.48-.7-.79-2.06-.79-2.06s.154-.493.164-.526c.279-.837.906-1.186 2.016-1.62.22-.08.43-.346.43-.69 0-.313-.247-.626-.52-.626-.055 0-.583.26-1.02.26-.419 0-.954-.175-.954-.175 0-1.2.126-3.365-.41-4.64C17.682 1.025 14.519-.024 12.166.006z"/></svg>
                    </span>
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

                <label className="block">
                  <div className="flex items-center gap-2 text-sm text-neutral-300">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black shrink-0" aria-hidden="true">
                      <svg viewBox="0 0 192 192" className="h-3 w-3 fill-white"><path d="M141.537 88.988a66.667 66.667 0 0 0-2.518-1.143c-1.482-27.307-16.403-42.94-41.457-43.1h-.34c-14.986 0-27.449 6.396-35.12 18.036l13.779 9.452c5.73-8.695 14.724-10.548 21.348-10.548h.229c8.249.053 14.474 2.452 18.503 7.129 2.932 3.405 4.893 8.111 5.864 14.05-7.314-1.243-15.224-1.626-23.68-1.14-23.82 1.371-39.134 15.264-38.105 34.568.522 9.792 5.4 18.216 13.735 23.719 7.047 4.652 16.124 6.927 25.557 6.412 12.458-.683 22.231-5.436 29.049-14.127 5.178-6.6 8.453-15.153 9.899-25.93 5.937 3.583 10.337 8.298 12.767 13.966 4.132 9.635 4.373 25.468-8.546 38.376-11.319 11.308-24.925 16.2-45.488 16.35-22.809-.169-40.06-7.484-51.275-21.742C35.236 139.966 29.808 120.682 29.605 96c.203-24.682 5.631-43.966 16.133-57.317C56.954 24.425 74.204 17.11 97.013 16.94c22.975.17 40.526 7.52 52.171 21.847 5.71 7.026 10.015 15.86 12.853 26.162l16.147-4.308c-3.44-12.68-8.853-23.606-16.219-32.668C147.036 9.607 125.202.195 97.07 0h-.113C68.882.195 47.292 9.642 32.788 28.08 19.882 44.485 13.224 67.315 13.001 95.932v.136c.223 28.617 6.881 51.447 19.787 67.854C47.292 182.358 68.882 191.805 96.957 192h.113c24.96-.173 42.554-6.708 57.048-21.189 18.963-18.945 18.392-42.692 12.142-57.27-4.484-10.454-13.033-18.945-24.723-24.553Z"/><path d="M96.33 120.664c-10.966.634-22.214-4.302-22.752-14.152-.388-7.249 5.154-15.348 26.208-16.572 2.288-.132 4.533-.197 6.733-.197 5.912 0 11.449.573 16.492 1.68-1.876 23.45-15.077 28.627-26.681 29.241Z"/></svg>
                    </span>
                    <span>Threads</span>
                    <span className="text-xs text-neutral-500">threads.net/@handle</span>
                  </div>
                  <div className="mt-2 flex items-center rounded-lg border border-[rgba(120,120,120,0.45)] bg-neutral-900/40 focus-within:border-[rgba(120,120,120,0.7)]">
                    <span className="px-3 text-neutral-500 text-sm select-none">@</span>
                    <input
                      name="social_threads"
                      defaultValue={profile?.social_threads ?? ""}
                      placeholder="yourhandle"
                      className="flex-1 bg-transparent py-3 pr-4 text-neutral-100 focus:outline-none text-sm"
                    />
                  </div>
                </label>

                <label className="block">
                  <div className="flex items-center gap-2 text-sm text-neutral-300">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full shrink-0 overflow-hidden" style={{ background: "linear-gradient(135deg,#f9e866,#f7c948,#e8833a,#d84e6f,#a83ab4)" }} aria-hidden="true">
                      <svg viewBox="0 0 24 24" className="h-3 w-3 fill-white"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.5 7.5h-2.25V8c0-.414.336-.75.75-.75h1.5V5.5H14.25A2.25 2.25 0 0 0 12 7.75V9.5H10.5V12H12v6.5h2.25V12h1.5l.75-2.5z"/></svg>
                    </span>
                    <span>Lemon8</span>
                    <span className="text-xs text-neutral-500">lemon8-app.com/@handle</span>
                  </div>
                  <div className="mt-2 flex items-center rounded-lg border border-[rgba(120,120,120,0.45)] bg-neutral-900/40 focus-within:border-[rgba(120,120,120,0.7)]">
                    <span className="px-3 text-neutral-500 text-sm select-none">@</span>
                    <input
                      name="social_lemon8"
                      defaultValue={profile?.social_lemon8 ?? ""}
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
