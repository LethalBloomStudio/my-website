import Link from "next/link";
import { redirect } from "next/navigation";
import Image from "next/image";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabase as anonSupabase } from "@/lib/supabaseClient";
import ManuscriptCarousel from "@/components/ManuscriptCarousel";
import AnnouncementsSection from "@/components/AnnouncementsSection";
import FriendsPanel from "@/components/FriendsPanel";
import FollowersPanel from "@/app/u/[username]/FollowersPanel";
import { setHighlightedManuscript, updateManuscriptBlurb } from "./actions";

export const dynamic = "force-dynamic";

type Manuscript = {
  id: string;
  title: string;
  genre: string | null;
  word_count: number;
  chapter_count: number;
  cover_url: string | null;
  visibility: string;
  description: string | null;
};

type Friend = {
  userId: string;
  penName: string | null;
  username: string | null;
  avatarUrl: string | null;
  isPublic: boolean;
};

type ProfileData = {
  username: string | null;
  pen_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  writes_genres: string[] | null;
  writer_level: string | null;
  publishing_goals: string | null;
  feedback_areas: string | null;
  feedback_preference: string | null;
  is_public: boolean | null;
  highlighted_manuscript_id: string | null;
  social_tiktok: string | null;
  social_facebook: string | null;
  social_instagram: string | null;
  social_x: string | null;
  social_snapchat: string | null;
};

function formatLevel(value: string | null) {
  if (!value) return "-";
  if (value === "gentle") return "Bloom";
  if (value === "balanced") return "Forge";
  if (value === "direct") return "Lethal";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function profileInitial(name: string | null) {
  if (!name) return "?";
  return name.charAt(0).toUpperCase();
}

export default async function ProfilePage() {
  const supabase = await supabaseServer();

  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) redirect("/sign-in");

  const { data } = await supabase
    .from("public_profiles")
    .select(
      "username, pen_name, avatar_url, banner_url, bio, writes_genres, writer_level, publishing_goals, feedback_areas, feedback_preference, is_public, highlighted_manuscript_id, social_tiktok, social_facebook, social_instagram, social_x, social_snapchat"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const p = data as ProfileData | null;

  const { data: acct } = await supabase.from("accounts").select("age_category").eq("user_id", user.id).maybeSingle();
  const isAdult = (acct as { age_category?: string } | null)?.age_category === "adult_18_plus";

  // Fetch own manuscripts (all visibilities)
  const { data: manuscriptData } = await supabase
    .from("manuscripts")
    .select("id, title, genre, word_count, chapter_count, cover_url, visibility, description")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  const highlightedId = p?.highlighted_manuscript_id ?? null;
  const rawManuscripts = (manuscriptData as Manuscript[] | null) ?? [];
  const manuscripts = highlightedId
    ? [
        ...rawManuscripts.filter((m) => m.id === highlightedId),
        ...rawManuscripts.filter((m) => m.id !== highlightedId),
      ]
    : rawManuscripts;

  // Fetch follower count + followers list
  const [{ count: followerCount }, { data: followerRows }] = await Promise.all([
    anonSupabase
      .from("profile_follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", user.id),
    anonSupabase
      .from("profile_follows")
      .select("follower_id")
      .eq("following_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const totalFollowers = followerCount ?? 0;
  let followers: { userId: string; name: string; username: string | null; avatarUrl: string | null }[] = [];
  const followerIds = (followerRows ?? []).map((r: { follower_id: string }) => r.follower_id);
  if (followerIds.length > 0) {
    const { data: followerProfiles } = await anonSupabase
      .from("public_profiles")
      .select("user_id, pen_name, username, avatar_url")
      .in("user_id", followerIds);
    followers = ((followerProfiles as { user_id: string; pen_name: string | null; username: string | null; avatar_url: string | null }[] | null) ?? []).map((fp) => ({
      userId: fp.user_id,
      name: fp.pen_name || (fp.username ? `@${fp.username}` : "Reader"),
      username: fp.username,
      avatarUrl: fp.avatar_url,
    }));
  }

  // Fetch accepted friends
  const { data: friendRows } = await supabase
    .from("profile_friend_requests")
    .select("sender_id, receiver_id")
    .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
    .eq("status", "accepted");

  const friendIds = (friendRows ?? []).map((r: { sender_id: string; receiver_id: string }) =>
    r.sender_id === user.id ? r.receiver_id : r.sender_id
  );

  let friends: Friend[] = [];
  if (friendIds.length > 0) {
    const { data: profiles } = await anonSupabase
      .from("public_profiles")
      .select("user_id, pen_name, username, avatar_url, is_public")
      .in("user_id", friendIds);
    friends = ((profiles as { user_id: string; pen_name: string | null; username: string | null; avatar_url: string | null; is_public: boolean }[] | null) ?? []).map((fp) => ({
      userId: fp.user_id,
      penName: fp.pen_name,
      username: fp.username,
      avatarUrl: fp.avatar_url,
      isPublic: !!fp.is_public,
    }));
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl space-y-10 px-6 py-16">
        <header className={`relative overflow-hidden space-y-3 rounded-2xl border border-[rgba(120,120,120,0.45)] p-6 text-center ${p?.banner_url ? "bg-neutral-950" : "bg-[rgba(120,120,120,0.18)]"}`}>
          {p?.banner_url && (
            <Image
              src={p.banner_url}
              alt="Profile banner"
              fill
              unoptimized
              className="profile-banner-img absolute inset-0 h-full w-full object-cover pointer-events-none select-none"
            />
          )}
          {/* Edit Profile button — bottom right corner */}
          <div className="absolute bottom-3 right-3 z-20">
            <Link
              href="/settings/profile"
              title="Edit Profile"
              className="flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition hover:scale-110"
              style={{ background: "rgba(40,40,40,0.85)" }}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white" aria-hidden="true">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
              </svg>
            </Link>
          </div>

          {/* Friends button + social media icons — bottom-left corner */}
          <div className="absolute bottom-3 left-3 z-20 flex gap-2">
            <FriendsPanel friends={friends} profileUserId={user.id} viewerUserId={user.id} />
            {isAdult && (
              <>
                {p?.social_tiktok && (
                  <a href={`https://tiktok.com/@${p.social_tiktok}`} target="_blank" rel="noopener noreferrer"
                    title={`TikTok: @${p.social_tiktok}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition hover:scale-110"
                    style={{background:"#010101"}}>
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white" aria-hidden="true">
                      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.79 1.54V6.78a4.85 4.85 0 01-1.02-.09z"/>
                    </svg>
                  </a>
                )}
                {p?.social_instagram && (
                  <a href={`https://instagram.com/${p.social_instagram}`} target="_blank" rel="noopener noreferrer"
                    title={`Instagram: @${p.social_instagram}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition hover:scale-110"
                    style={{background:"radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)"}}>
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                  </a>
                )}
                {p?.social_facebook && (
                  <a href={`https://facebook.com/${p.social_facebook}`} target="_blank" rel="noopener noreferrer"
                    title={`Facebook: ${p.social_facebook}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition hover:scale-110"
                    style={{background:"#1877F2"}}>
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white" aria-hidden="true"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.887v2.269h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
                  </a>
                )}
                {p?.social_x && (
                  <a href={`https://x.com/@${p.social_x}`} target="_blank" rel="noopener noreferrer"
                    title={`X: @${p.social_x}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition hover:scale-110"
                    style={{background:"#000000"}}>
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  </a>
                )}
                {p?.social_snapchat && (
                  <a href={`https://snapchat.com/add/${p.social_snapchat}`} target="_blank" rel="noopener noreferrer"
                    title={`Snapchat: @${p.social_snapchat}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition hover:scale-110"
                    style={{background:"#FFFC00"}}>
                    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="#000000"><path d="M12.166.006c.127-.008.256-.006.38-.006 1.73 0 3.356.604 4.63 1.748C18.47 2.9 19.2 4.58 19.2 6.4v.803c0 .847.058 1.69.172 2.524.087.033.183.05.28.05.28 0 .567-.108.87-.217.152-.054.308-.11.467-.154a1.99 1.99 0 01.503-.066c.356 0 .695.103.957.29.308.219.478.522.478.848 0 .527-.44.993-1.309 1.386-.086.04-.197.08-.322.124-.39.137-.98.345-1.116.796-.062.208-.02.453.128.754.013.026.8 1.68 2.373 2.492.367.19.529.615.39.998-.057.161-.222.515-.676.804-.592.379-1.373.535-2.324.468-.104-.008-.21-.017-.316-.029l-.004.03c-.067.504-.137 1.026-.625 1.526-.454.469-1.114.73-2.016.8-.5.038-.893.178-1.264.31a5.9 5.9 0 01-.435.14c-.497.13-.929.196-1.32.196-.543 0-1.014-.115-1.447-.352a9.46 9.46 0 01-.773-.483c-.376-.252-.72-.482-1.08-.565a3.337 3.337 0 00-.73-.076c-.26 0-.518.026-.772.076-.36.082-.702.313-1.079.565-.247.166-.51.34-.775.484-.431.236-.9.351-1.443.351-.391 0-.824-.066-1.323-.196a5.995 5.995 0 01-.433-.14c-.37-.132-.763-.27-1.261-.308-.903-.072-1.564-.333-2.018-.802-.487-.5-.557-1.022-.624-1.526l-.004-.03a10.47 10.47 0 01-.316.029c-.95.066-1.732-.09-2.323-.469-.455-.288-.62-.643-.677-.804a.866.866 0 01.39-.998c1.575-.812 2.362-2.466 2.374-2.492.147-.301.189-.546.127-.754-.136-.45-.724-.659-1.115-.796-.124-.044-.235-.084-.32-.122C.44 11.4 0 10.934 0 10.407c0-.326.169-.63.476-.848.264-.188.604-.29.96-.29.17 0 .34.023.5.066.16.044.314.1.466.154.303.109.59.217.87.217.096 0 .192-.017.28-.05A18.55 18.55 0 014.8 7.203V6.4C4.8 4.58 5.53 2.9 6.824 1.748 8.099.604 9.721 0 11.451 0h.338c.125 0 .25.002.377.006z"/></svg>
                  </a>
                )}
              </>
            )}
          </div>

          <div className="relative z-10 space-y-3">
          {p?.avatar_url ? (
            <Image
              src={p.avatar_url}
              alt={`${p.pen_name || p.username || "User"} profile picture`}
              width={96}
              height={96}
              unoptimized
              className="mx-auto h-24 w-24 rounded-full border border-[rgba(120,120,120,0.65)] object-cover"
            />
          ) : (
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-[rgba(120,120,120,0.65)] bg-[rgba(120,120,120,0.2)] text-3xl font-semibold text-neutral-100">
              {profileInitial(p?.pen_name || p?.username || null)}
            </div>
          )}
          <h1 className="text-3xl font-semibold tracking-tight">{p?.pen_name || p?.username || "Profile"}</h1>
          <p className="text-sm text-neutral-300">@{p?.username || "-"}</p>
          <FollowersPanel
            initialCount={totalFollowers}
            followers={followers}
            profileUserId={user.id}
          />
          </div>
        </header>

        {/* Info + Manuscripts side by side */}
        <div className="grid gap-6 lg:grid-cols-2 items-stretch">
          {/* Info left */}
          <section className="space-y-4 rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-5">
            <div>
              <div className="text-sm text-neutral-300">Writer bio</div>
              <div className="whitespace-pre-line text-neutral-100">{p?.bio || "-"}</div>
            </div>

            <div>
              <div className="text-sm text-neutral-300">Genres they write</div>
              <div className="text-neutral-100">{(p?.writes_genres || []).join(", ") || "-"}</div>
            </div>

            <div>
              <div className="text-sm text-neutral-300">Writer level</div>
              <div className="text-neutral-100">{formatLevel(p?.writer_level ?? null)}</div>
            </div>

            <div>
              <div className="text-sm text-neutral-300">Publishing goals</div>
              <div className="whitespace-pre-line text-neutral-100">{p?.publishing_goals || "-"}</div>
            </div>

            <div>
              <div className="text-sm text-neutral-300">Level of feedback preferred</div>
              <div className="text-neutral-100">{formatLevel(p?.feedback_preference ?? null)}</div>
            </div>

            <div>
              <div className="text-sm text-neutral-300">Areas they&apos;d like feedback on</div>
              <div className="whitespace-pre-line text-neutral-100">{p?.feedback_areas || "-"}</div>
            </div>
          </section>

          {/* Manuscripts right */}
          <section className="flex flex-col rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-neutral-400">Your Manuscripts</h2>
            <div className="flex-1">
              <ManuscriptCarousel
                manuscripts={manuscripts}
                isOwner
                highlightedId={highlightedId}
                onSetHighlight={setHighlightedManuscript}
                onSaveBlurb={updateManuscriptBlurb}
              />
            </div>
          </section>
        </div>

        {/* Announcements */}
        <AnnouncementsSection
          profileUserId={user.id}
          viewerId={user.id}
          isOwner
          ownerName={p?.pen_name || p?.username}
          ownerAvatar={p?.avatar_url}
          ownerUsername={p?.username}
        />

      </div>
    </main>
  );
}
