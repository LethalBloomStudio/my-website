import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";
import FriendButton from "./FriendButton";
import FollowButton from "./FollowButton";
import FollowersPanel from "./FollowersPanel";
import ReportButton from "./ReportButton";
import ManuscriptCarousel from "@/components/ManuscriptCarousel";
import AnnouncementsSection from "@/components/AnnouncementsSection";
import FriendsPanel from "@/components/FriendsPanel";

export const dynamic = "force-dynamic";

type Manuscript = {
  id: string;
  title: string;
  genre: string | null;
  word_count: number;
  chapter_count: number;
  published_chapter_count?: number;
  cover_url: string | null;
  visibility: string;
  description: string | null;
};

type PublicProfile = {
  user_id: string;
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
  is_public: boolean;
  highlighted_manuscript_id: string | null;
  social_tiktok: string | null;
  social_facebook: string | null;
  social_instagram: string | null;
  social_x: string | null;
  social_snapchat: string | null;
};

type FollowerProfile = {
  userId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
};

type FriendProfile = {
  userId: string;
  penName: string | null;
  username: string | null;
  avatarUrl: string | null;
  isPublic: boolean;
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

export default async function PublicProfilePage(props: {
  params: Promise<{ username: string }>;
}) {
  const { username: raw } = await props.params;

  if (!raw) return notFound();
  const username = raw.toLowerCase();

  // Use admin client so youth profiles (is_public = false) aren't blocked by RLS
  const { data, error } = await supabaseAdmin()
    .from("public_profiles")
    .select(
      "user_id, username, pen_name, avatar_url, banner_url, bio, writes_genres, writer_level, publishing_goals, feedback_areas, feedback_preference, is_public, highlighted_manuscript_id, social_tiktok, social_facebook, social_instagram, social_x, social_snapchat"
    )
    .eq("username", username)
    .single();

  const p = data as PublicProfile | null;
  if (error || !p) return notFound();

  // Get current viewer identity
  const serverSupabase = await supabaseServer();
  const { data: authData } = await serverSupabase.auth.getUser();
  const viewerId = authData.user?.id ?? null;
  const isOwner = viewerId === p.user_id;

  // Check if this profile belongs to an admin, and fetch owner's age_category
  // Must use supabaseAdmin — anon client is blocked by RLS for cross-user accounts reads
  const { data: accRow } = await supabaseAdmin()
    .from("accounts")
    .select("is_admin, age_category")
    .eq("user_id", p.user_id)
    .maybeSingle();
  const accRowTyped = accRow as { is_admin?: boolean; age_category?: string } | null;
  const isAdminProfile = !!accRowTyped?.is_admin;
  const profileOwnerIsYouth = accRowTyped?.age_category === "youth_13_17";

  // For private adult profiles: check if viewer is an accepted friend (friends can view each other's private profiles)
  let viewerIsFriend = false;
  if (!p.is_public && !profileOwnerIsYouth && viewerId && !isOwner) {
    const [{ data: sentFr }, { data: receivedFr }] = await Promise.all([
      supabaseAdmin().from("profile_friend_requests").select("id").eq("sender_id", viewerId).eq("receiver_id", p.user_id).eq("status", "accepted").maybeSingle(),
      supabaseAdmin().from("profile_friend_requests").select("id").eq("sender_id", p.user_id).eq("receiver_id", viewerId).eq("status", "accepted").maybeSingle(),
    ]);
    viewerIsFriend = !!(sentFr || receivedFr);
  }

  // Non-public, non-youth profiles are not visible to anyone but the owner and their accepted friends
  if (!p.is_public && !profileOwnerIsYouth && !isOwner && !viewerIsFriend) return notFound();

  // Fetch viewer's age_category once (used for both visibility guard and isParentProfile)
  let viewerAgeCategory: string | null = null;
  if (viewerId && !isOwner) {
    const { data: viewerAcct } = await supabaseAdmin()
      .from("accounts")
      .select("age_category")
      .eq("user_id", viewerId)
      .maybeSingle();
    viewerAgeCategory = (viewerAcct as { age_category?: string } | null)?.age_category ?? null;
  }

  // Youth profiles are only visible to other youth and the linked parent — block everyone else
  if (profileOwnerIsYouth && !isOwner) {
    const viewerIsYouth = viewerAgeCategory === "youth_13_17";
    if (!viewerIsYouth) {
      // Allow the linked parent through
      let isLinkedParent = false;
      if (viewerId) {
        const { data: parentLink } = await supabaseAdmin()
          .from("youth_links")
          .select("id")
          .eq("parent_user_id", viewerId)
          .eq("child_user_id", p.user_id)
          .eq("status", "active")
          .maybeSingle();
        isLinkedParent = !!parentLink;
      }
      if (!isLinkedParent) return notFound();
    }
  }

  // Check if the viewer (youth) is viewing their linked parent
  let isParentProfile = false;
  if (viewerId && !isOwner && viewerAgeCategory === "youth_13_17") {
    const { data: youthLink } = await supabaseAdmin()
      .from("youth_links")
      .select("parent_user_id")
      .eq("child_user_id", viewerId)
      .eq("status", "active")
      .maybeSingle();
    isParentProfile = (youthLink as { parent_user_id?: string } | null)?.parent_user_id === p.user_id;
  }

  // Fetch friendship status between viewer and profile owner
  type FriendStatus = "none" | "pending_sent" | "pending_received" | "accepted" | "unfriended" | "blocked";
  let friendStatus: FriendStatus = "none";
  if (viewerId && !isOwner) {
    type FrRow = { sender_id: string; receiver_id: string; status: string };
    const [{ data: sentRow }, { data: receivedRow }] = await Promise.all([
      serverSupabase
        .from("profile_friend_requests")
        .select("sender_id, receiver_id, status")
        .eq("sender_id", viewerId)
        .eq("receiver_id", p.user_id)
        .maybeSingle(),
      serverSupabase
        .from("profile_friend_requests")
        .select("sender_id, receiver_id, status")
        .eq("sender_id", p.user_id)
        .eq("receiver_id", viewerId)
        .maybeSingle(),
    ]);
    const rows = [sentRow, receivedRow].filter(Boolean) as FrRow[];
    const fr = rows.find(r => r.status === "accepted")
      ?? rows.find(r => r.status === "pending")
      ?? rows.find(r => r.status === "unfriended")
      ?? rows[0]
      ?? null;
    if (fr) {
      const s = fr.status;
      const isSender = fr.sender_id === viewerId;
      if (s === "blocked") friendStatus = "blocked";
      else if (s === "accepted") friendStatus = "accepted";
      else if (s === "unfriended") friendStatus = "unfriended";
      else if (s === "pending") friendStatus = isSender ? "pending_sent" : "pending_received";
      else if (s === "denied" && isSender) friendStatus = "pending_sent";
    }
  }

  // Fetch follower count + viewer follow status + followers list (owner only)
  const [{ count: followerCount }, viewerFollowRow, followersData] = await Promise.all([
    supabase
      .from("profile_follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", p.user_id),
    viewerId && !isOwner
      ? serverSupabase
          .from("profile_follows")
          .select("follower_id")
          .eq("follower_id", viewerId)
          .eq("following_id", p.user_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    isOwner
      ? supabase
          .from("profile_follows")
          .select("follower_id")
          .eq("following_id", p.user_id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const viewerFollows = !!(viewerFollowRow as { data: unknown }).data;
  const totalFollowers = followerCount ?? 0;

  // Resolve follower profiles for owner
  let followers: FollowerProfile[] = [];
  if (isOwner) {
    const followerIds = ((followersData as { data: { follower_id: string }[] | null }).data ?? []).map(
      (r) => r.follower_id
    );
    if (followerIds.length > 0) {
      const { data: profiles } = await supabase
        .from("public_profiles")
        .select("user_id, pen_name, username, avatar_url")
        .in("user_id", followerIds);
      followers = ((profiles as { user_id: string; pen_name: string | null; username: string | null; avatar_url: string | null }[] | null) ?? []).map(
        (prof) => ({
          userId: prof.user_id,
          name: prof.pen_name || (prof.username ? `@${prof.username}` : "Reader"),
          username: prof.username,
          avatarUrl: prof.avatar_url,
        })
      );
    }
  }

  // Fetch accepted friends for this profile
  const { data: friendRows } = await supabaseAdmin()
    .from("profile_friend_requests")
    .select("sender_id, receiver_id")
    .or(`sender_id.eq.${p.user_id},receiver_id.eq.${p.user_id}`)
    .eq("status", "accepted");

  let friends: FriendProfile[] = [];
  const friendIds = ((friendRows ?? []) as { sender_id: string; receiver_id: string }[]).map((r) =>
    r.sender_id === p.user_id ? r.receiver_id : r.sender_id
  );
  if (friendIds.length > 0) {
    const { data: friendProfiles } = await supabaseAdmin()
      .from("public_profiles")
      .select("user_id, pen_name, username, avatar_url, is_public")
      .in("user_id", friendIds);
    friends = ((friendProfiles as { user_id: string; pen_name: string | null; username: string | null; avatar_url: string | null; is_public: boolean }[] | null) ?? []).map((fp) => ({
      userId: fp.user_id,
      penName: fp.pen_name,
      username: fp.username,
      avatarUrl: fp.avatar_url,
      isPublic: !!fp.is_public,
    }));
  }

  // Fetch public manuscripts for this profile
  const { data: manuscriptData } = await supabase
    .from("manuscripts")
    .select("id, title, genre, word_count, chapter_count, cover_url, description")
    .eq("owner_id", p.user_id)
    .eq("visibility", "public")
    .order("created_at", { ascending: false });

  const highlightedId = p.highlighted_manuscript_id ?? null;
  const baseManuscripts = ((manuscriptData as Omit<Manuscript, "visibility">[] | null) ?? []).map(
    (m) => ({ ...m, visibility: "public" })
  );

  // Fetch published-only chapter counts (excludes drafts, prologues, epilogues, trigger pages)
  const manuscriptIds = baseManuscripts.map((m) => m.id);
  const publishedCounts: Record<string, number> = {};
  if (manuscriptIds.length > 0) {
    const { data: pubChapters } = await supabaseAdmin()
      .from("manuscript_chapters")
      .select("manuscript_id")
      .in("manuscript_id", manuscriptIds)
      .eq("is_private", false)
      .eq("chapter_type", "chapter");
    for (const row of (pubChapters as { manuscript_id: string }[] | null) ?? []) {
      publishedCounts[row.manuscript_id] = (publishedCounts[row.manuscript_id] ?? 0) + 1;
    }
  }
  const rawManuscripts = baseManuscripts.map((m) => ({
    ...m,
    published_chapter_count: publishedCounts[m.id] ?? 0,
  }));
  const manuscripts = highlightedId
    ? [
        ...rawManuscripts.filter((m) => m.id === highlightedId),
        ...rawManuscripts.filter((m) => m.id !== highlightedId),
      ]
    : rawManuscripts;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl space-y-10 px-6 py-16">
        <header className={`relative overflow-hidden space-y-3 rounded-2xl border border-[rgba(120,120,120,0.45)] p-6 text-center ${p.banner_url ? "bg-neutral-950" : "bg-[rgba(120,120,120,0.18)]"}`}>
          {p.banner_url && (
            <Image
              src={p.banner_url}
              alt="Profile banner"
              fill
             
              className="profile-banner-img absolute inset-0 h-full w-full object-cover pointer-events-none select-none"
            />
          )}

          {/* Follow + Friend buttons — bottom right */}
          {viewerId && !isOwner && (
            <div className="absolute bottom-3 right-3 z-20 flex flex-wrap gap-2">
              <FollowButton
                viewerId={viewerId}
                profileUserId={p.user_id}
                initialFollowing={viewerFollows}
              />
              <FriendButton
                viewerId={viewerId}
                profileUserId={p.user_id}
                initialStatus={friendStatus}
                isAdminProfile={isAdminProfile}
                isParentProfile={isParentProfile}
                ownerAgeCategory={accRowTyped?.age_category ?? null}
                viewerAgeCategory={viewerAgeCategory}
              />
            </div>
          )}

          {/* Friends button + social media icons — bottom-left corner */}
          {!profileOwnerIsYouth && (
            <div className="absolute bottom-3 left-3 z-20 flex gap-2">
              <FriendsPanel friends={friends} profileUserId={p.user_id} viewerUserId={viewerId} />
              {p.social_tiktok && (
                <a href={`https://tiktok.com/@${p.social_tiktok}`} target="_blank" rel="noopener noreferrer"
                  title={`TikTok: @${p.social_tiktok}`}
                  className="social-badge social-badge--tiktok flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition hover:scale-110">
                  <svg viewBox="-2 0 28 24" className="h-4 w-4" aria-hidden="true">
                    <path fill="#EE1D52" transform="translate(1.5,0)" d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.79 1.54V6.78a4.85 4.85 0 01-1.02-.09z"/>
                    <path fill="#69C9D0" transform="translate(-1.5,0)" d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.79 1.54V6.78a4.85 4.85 0 01-1.02-.09z"/>
                    <path fill="#ffffff" d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.79 1.54V6.78a4.85 4.85 0 01-1.02-.09z"/>
                  </svg>
                </a>
              )}
              {p.social_instagram && (
                <a href={`https://instagram.com/${p.social_instagram}`} target="_blank" rel="noopener noreferrer"
                  title={`Instagram: @${p.social_instagram}`}
                  className="social-badge social-badge--instagram flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition hover:scale-110">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                </a>
              )}
              {p.social_facebook && (
                <a href={`https://facebook.com/${p.social_facebook}`} target="_blank" rel="noopener noreferrer"
                  title={`Facebook: ${p.social_facebook}`}
                  className="social-badge social-badge--facebook flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition hover:scale-110">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white" aria-hidden="true"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.887v2.269h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
                </a>
              )}
              {p.social_x && (
                <a href={`https://x.com/@${p.social_x}`} target="_blank" rel="noopener noreferrer"
                  title={`X: @${p.social_x}`}
                  className="social-badge social-badge--x flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition hover:scale-110">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </a>
              )}
              {p.social_snapchat && (
                <a href={`https://snapchat.com/add/${p.social_snapchat}`} target="_blank" rel="noopener noreferrer"
                  title={`Snapchat: @${p.social_snapchat}`}
                  className="social-badge social-badge--snapchat flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition hover:scale-110">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white stroke-black [stroke-width:1.1]" aria-hidden="true"><path d="M12.166.006c.127-.008.256-.006.38-.006 1.73 0 3.356.604 4.63 1.748C18.47 2.9 19.2 4.58 19.2 6.4v.803c0 .847.058 1.69.172 2.524.087.033.183.05.28.05.28 0 .567-.108.87-.217.152-.054.308-.11.467-.154a1.99 1.99 0 01.503-.066c.356 0 .695.103.957.29.308.219.478.522.478.848 0 .527-.44.993-1.309 1.386-.086.04-.197.08-.322.124-.39.137-.98.345-1.116.796-.062.208-.02.453.128.754.013.026.8 1.68 2.373 2.492.367.19.529.615.39.998-.057.161-.222.515-.676.804-.592.379-1.373.535-2.324.468-.104-.008-.21-.017-.316-.029l-.004.03c-.067.504-.137 1.026-.625 1.526-.454.469-1.114.73-2.016.8-.5.038-.893.178-1.264.31a5.9 5.9 0 01-.435.14c-.497.13-.929.196-1.32.196-.543 0-1.014-.115-1.447-.352a9.46 9.46 0 01-.773-.483c-.376-.252-.72-.482-1.08-.565a3.337 3.337 0 00-.73-.076c-.26 0-.518.026-.772.076-.36.082-.702.313-1.079.565-.247.166-.51.34-.775.484-.431.236-.9.351-1.443.351-.391 0-.824-.066-1.323-.196a5.995 5.995 0 01-.433-.14c-.37-.132-.763-.27-1.261-.308-.903-.072-1.564-.333-2.018-.802-.487-.5-.557-1.022-.624-1.526l-.004-.03a10.47 10.47 0 01-.316.029c-.95.066-1.732-.09-2.323-.469-.455-.288-.62-.643-.677-.804a.866.866 0 01.39-.998c1.575-.812 2.362-2.466 2.374-2.492.147-.301.189-.546.127-.754-.136-.45-.724-.659-1.115-.796-.124-.044-.235-.084-.32-.122C.44 11.4 0 10.934 0 10.407c0-.326.169-.63.476-.848.264-.188.604-.29.96-.29.17 0 .34.023.5.066.16.044.314.1.466.154.303.109.59.217.87.217.096 0 .192-.017.28-.05A18.55 18.55 0 014.8 7.203V6.4C4.8 4.58 5.53 2.9 6.824 1.748 8.099.604 9.721 0 11.451 0h.338c.125 0 .25.002.377.006z"/></svg>
                </a>
              )}
            </div>
          )}

          <div className="relative z-10 space-y-3">
            {p.avatar_url ? (
              <Image
                src={p.avatar_url}
                alt={`${p.pen_name || p.username || "User"} profile picture`}
                width={96}
                height={96}
               
                className="mx-auto h-24 w-24 rounded-full border border-[rgba(120,120,120,0.65)] object-cover"
              />
            ) : (
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-[rgba(120,120,120,0.65)] bg-[rgba(120,120,120,0.2)] text-3xl font-semibold text-neutral-100">
                {profileInitial(p.pen_name || p.username)}
              </div>
            )}

            <h1 className="text-3xl font-semibold tracking-tight">{p.pen_name || p.username || "-"}</h1>

            {p.username && !isOwner && viewerAgeCategory !== "youth_13_17" ? (
              <Link
                href={`/messages?with=${encodeURIComponent(p.user_id)}`}
                className="inline-block text-sm text-[rgba(210,210,210,0.85)] hover:text-white hover:underline transition"
              >
                @{p.username}
              </Link>
            ) : (
              <p className="text-sm text-neutral-300">@{p.username || "-"}</p>
            )}

            {/* Follower count — always visible */}
            {isOwner ? (
              <FollowersPanel initialCount={totalFollowers} followers={followers} profileUserId={p.user_id} />
            ) : (
              <p className="text-sm text-neutral-400">
                {totalFollowers} {totalFollowers === 1 ? "Follower" : "Followers"}
              </p>
            )}

          </div>
        </header>

        {/* Info + Manuscripts side by side */}
        <div className="grid gap-6 lg:grid-cols-2 items-stretch">
          {/* Info left */}
          <section className="space-y-4 rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-neutral-400">Get to Know Me</h2>
            <div>
              <div className="text-sm text-neutral-300">Writer bio</div>
              <div className="whitespace-pre-line text-neutral-100">{p.bio || "-"}</div>
            </div>

            <div>
              <div className="text-sm text-neutral-300">Genres they write</div>
              <div className="text-neutral-100">{(p.writes_genres || []).join(", ") || "-"}</div>
            </div>

            <div>
              <div className="text-sm text-neutral-300">Writer level</div>
              <div className="text-neutral-100">{formatLevel(p.writer_level)}</div>
            </div>

            <div>
              <div className="text-sm text-neutral-300">Publishing goals</div>
              <div className="whitespace-pre-line text-neutral-100">{p.publishing_goals || "-"}</div>
            </div>

            <div>
              <div className="text-sm text-neutral-300">Level of feedback preferred</div>
              <div className="text-neutral-100">{formatLevel(p.feedback_preference)}</div>
            </div>

            <div>
              <div className="text-sm text-neutral-300">Areas they&apos;d like feedback on</div>
              <div className="whitespace-pre-line text-neutral-100">{p.feedback_areas || "-"}</div>
            </div>
          </section>

          {/* Manuscripts right */}
          <section className="flex flex-col rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-5">
            <h2 className="mb-4 shrink-0 text-sm font-semibold uppercase tracking-widest text-neutral-400">
              My Manuscripts
            </h2>
            <div className="relative flex-1 min-h-0">
              <div className="absolute inset-0">
                <ManuscriptCarousel
                  manuscripts={manuscripts}
                  highlightedId={highlightedId}
                  isOwner={isOwner}
                />
              </div>
            </div>
          </section>
        </div>

        {/* Announcements */}
        <AnnouncementsSection
          profileUserId={p.user_id}
          viewerId={viewerId}
          isOwner={isOwner}
          ownerName={p.pen_name || p.username}
          ownerAvatar={p.avatar_url}
          ownerUsername={p.username}
        />

        {viewerId && !isOwner && (
          <div className="flex justify-center">
            <ReportButton
              viewerId={viewerId}
              profileUserId={p.user_id}
              targetName={p.pen_name || p.username || "this user"}
              isParentProfile={isParentProfile}
            />
          </div>
        )}
      </div>
    </main>
  );
}
