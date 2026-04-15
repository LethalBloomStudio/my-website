"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/Supabase/browser";
import { YOUTH_ALLOWED_CATEGORIES } from "@/lib/manuscriptOptions";
import OutOfCoinsModal from "@/components/OutOfCoinsModal";

const MAX_SLOTS = 25;
const COST = 100;
const INITIAL_NOW = Date.now();

type FeaturedSlot = {
  id: string;
  manuscript_id: string;
  owner_id: string;
  cover_url: string | null;
  title: string;
  expires_at: string;
};

type UserManuscript = {
  id: string;
  title: string;
  cover_url: string | null;
};

function formatRemaining(expiresAt: string, now: number): string {
  const diff = new Date(expiresAt).getTime() - now;
  if (diff <= 0) return "Expired";
  const totalSec = Math.floor(diff / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function FeaturedCarousel() {
  const supabase = useMemo(() => supabaseBrowser(), []);

  // Audience is determined from the user's own age_category - never derived from a prop
  // so there's no flash of the wrong carousel while the parent is still loading.
  const [audience, setAudience] = useState<"adult" | "youth" | null>(null);

  const [slots, setSlots] = useState<FeaturedSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [coins, setCoins] = useState(0);
  const [userManuscripts, setUserManuscripts] = useState<UserManuscript[]>([]);
  const [myActiveSlot, setMyActiveSlot] = useState<{ manuscript_id: string; expires_at: string } | null | undefined>(undefined);
  const [now, setNow] = useState(INITIAL_NOW);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isHoveredRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  // Modal
  const [showOutOfCoins, setShowOutOfCoins] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState<"select" | "confirm">("select");
  const [selectedMs, setSelectedMs] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [buyMsg, setBuyMsg] = useState<string | null>(null);

  // Tick every second for timers
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const scroll = useCallback((dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = 220;
    const copyWidth = el.scrollWidth / 3;
    // Silently reposition into the middle copy so both arrows always have room.
    if (el.scrollLeft < copyWidth) {
      el.scrollLeft += copyWidth;
    } else if (el.scrollLeft > copyWidth * 2) {
      el.scrollLeft -= copyWidth;
    }
    // Direct assignment - avoids the scrollBy smooth-scroll being cancelled by the
    // RAF loop's own direct scrollLeft writes on the very next animation frame.
    el.scrollLeft += dir === "left" ? -amount : amount;
  }, []);

  const loadSlots = useCallback(async () => {
    if (!audience) return;
    const { data: featured, error } = await supabase
      .from("featured_manuscripts")
      .select("id, manuscript_id, owner_id, expires_at")
      .eq("audience", audience)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(MAX_SLOTS);

    if (error) {
      console.error("[FeaturedCarousel] loadSlots error:", error.message);
    }

    if (!featured || featured.length === 0) {
      setSlots([]);
      setLoading(false);
      return;
    }

    const rows = featured as { id: string; manuscript_id: string; owner_id: string; expires_at: string }[];
    const msIds = rows.map((r) => r.manuscript_id);

    const { data: manuscripts } = await supabase
      .from("manuscripts")
      .select("id, cover_url, title")
      .in("id", msIds);

    const msMap = new Map(
      ((manuscripts as { id: string; cover_url: string | null; title: string }[] | null) ?? []).map(
        (m) => [m.id, m]
      )
    );

    setSlots(
      rows.map((row) => ({
        id: row.id,
        manuscript_id: row.manuscript_id,
        owner_id: row.owner_id,
        expires_at: row.expires_at,
        cover_url: msMap.get(row.manuscript_id)?.cover_url ?? null,
        title: msMap.get(row.manuscript_id)?.title ?? "Untitled",
      }))
    );
    setLoading(false);
  }, [supabase, audience]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();

      // Determine audience from this user's own age_category before loading anything
      let resolvedAudience: "adult" | "youth" = "adult";
      if (user) {
        setUserId(user.id);
        const { data: acct } = await supabase
          .from("accounts")
          .select("bloom_coins, age_category")
          .eq("user_id", user.id)
          .maybeSingle();
        const acctRow = acct as { bloom_coins?: number; age_category?: string } | null;
        setCoins(Number(acctRow?.bloom_coins ?? 0));
        if (acctRow?.age_category === "youth_13_17") resolvedAudience = "youth";

        // Directly check whether this user has an active slot (ground truth, not inferred from carousel)
        const thisAudience = acctRow?.age_category === "youth_13_17" ? "youth" : "adult";
        const { data: ownSlotRows } = await supabase
          .from("featured_manuscripts")
          .select("manuscript_id, expires_at")
          .eq("owner_id", user.id)
          .eq("audience", thisAudience)
          .gt("expires_at", new Date().toISOString())
          .limit(1);
        const ownSlotArr = ownSlotRows as { manuscript_id: string; expires_at: string }[] | null;
        setMyActiveSlot(ownSlotArr && ownSlotArr.length > 0 ? ownSlotArr[0] : null);

        // For youth, only show YA/MG manuscripts they can feature
        const msQuery = supabase
          .from("manuscripts")
          .select("id, title, cover_url, categories, genre")
          .eq("owner_id", user.id)
          .eq("visibility", "public")
          .order("created_at", { ascending: false });
        const { data: ms } = await msQuery;
        let manuscripts = (ms as (UserManuscript & { categories?: string[] | null; genre?: string | null })[] | null) ?? [];
        if (resolvedAudience === "youth") {
          manuscripts = manuscripts.filter((m) => {
            const cats = (m.categories?.length ? m.categories : m.genre ? [m.genre] : []) as string[];
            return cats.some((c) => YOUTH_ALLOWED_CATEGORIES.includes(c));
          });
        }
        setUserManuscripts(manuscripts.map(({ id, title, cover_url }) => ({ id, title, cover_url })));
      }

      setAudience(resolvedAudience);
    })();
  }, [supabase]);

  // Load slots once audience is known, then keep live via realtime
  useEffect(() => {
    if (!audience) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSlots();
    const ch = supabase
      .channel(`featured-carousel-${audience}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "featured_manuscripts" }, () => {
        void loadSlots();
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [audience, loadSlots, supabase]);

  // After slots render, initialise scroll to the middle copy so both arrows have room
  useEffect(() => {
    if (loading) return;
    const el = scrollRef.current;
    if (!el) return;
    // Use rAF so the DOM has fully painted the triple-copy content
    const raf = requestAnimationFrame(() => {
      el.scrollLeft = el.scrollWidth / 3;
    });
    return () => cancelAnimationFrame(raf);
  }, [loading]);

  // Steady auto-scroll via rAF - 40 px/s, pauses when cursor is inside the carousel
  useEffect(() => {
    if (loading) return;
    let last: number | null = null;
    const SPEED = 40; // px per second

    function step(ts: number) {
      if (last !== null && !isHoveredRef.current) {
        const el = scrollRef.current;
        if (el) {
          const copyWidth = el.scrollWidth / 3;
          // Seamlessly wrap: jump back one copy width when we pass the end of the middle copy
          if (el.scrollLeft >= copyWidth * 2) el.scrollLeft -= copyWidth;
          el.scrollLeft += SPEED * ((ts - last) / 1000);
        }
      }
      last = ts;
      rafRef.current = requestAnimationFrame(step);
    }

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [loading]);

  // Deduplicate: only the first (oldest) active slot per owner is shown
  const dedupedSlots = useMemo(() => {
    const seen = new Set<string>();
    return slots.filter((s) => {
      if (seen.has(s.owner_id)) return false;
      seen.add(s.owner_id);
      return true;
    });
  }, [slots]);

  // myActiveSlot === undefined means the check hasn't finished yet; treat as no slot to avoid false-blocking
  const userHasSlot = !!userId && !!myActiveSlot;
  const emptyCount = Math.max(0, MAX_SLOTS - dedupedSlots.length);
  const selectedTitle = userManuscripts.find((m) => m.id === selectedMs)?.title;

  function openModal() {
    setShowModal(true);
    setStep("select");
    setSelectedMs(null);
    setBuyMsg(null);
  }

  function closeModal() {
    setShowModal(false);
    setStep("select");
    setSelectedMs(null);
    setBuyMsg(null);
  }

  async function handlePurchase() {
    if (!selectedMs) return;
    setBuying(true);
    setBuyMsg(null);
    const res = await fetch("/api/feature-manuscript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manuscript_id: selectedMs, audience }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    setBuying(false);
    if (!res.ok || json.error) {
      if (json.error?.toLowerCase().includes("insufficient") || json.error?.toLowerCase().includes("bloom coins")) {
        closeModal();
        setShowOutOfCoins(true);
      } else {
        setBuyMsg(json.error ?? "Something went wrong.");
        setStep("select");
      }
      return;
    }
    setCoins((c) => c - COST);
    closeModal();
    await loadSlots();
    // Refresh own-slot status after purchase
    if (userId && audience) {
      const { data: refreshed } = await supabase
        .from("featured_manuscripts")
        .select("manuscript_id, expires_at")
        .eq("owner_id", userId)
        .eq("audience", audience)
        .gt("expires_at", new Date().toISOString())
        .limit(1);
      const arr = refreshed as { manuscript_id: string; expires_at: string }[] | null;
      setMyActiveSlot(arr && arr.length > 0 ? arr[0] : null);
    }
  }

  // Don't render at all until we know which carousel to show
  if (!audience) return <div className="mt-8 h-[220px] rounded-2xl border border-[rgba(120,120,120,0.2)] bg-[rgba(20,20,20,0.6)] animate-pulse" />;

  return (
    <div className="mt-8">
      <section
        className="rounded-2xl border border-[rgba(120,120,120,0.35)] bg-[rgba(20,20,20,0.92)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)]"
        aria-labelledby="featured-carousel-heading"
        onMouseEnter={() => { isHoveredRef.current = true; }}
        onMouseLeave={() => { isHoveredRef.current = false; }}
        onTouchStart={() => { isHoveredRef.current = true; }}
        onTouchEnd={() => { isHoveredRef.current = false; }}
        onTouchCancel={() => { isHoveredRef.current = false; }}
      >
        <div className="flex items-center justify-between">
          <h2 id="featured-carousel-heading" className="text-lg font-semibold text-white">Featured</h2>
          <span className="text-xs text-neutral-200">
            {loading ? "Loading…" : `${dedupedSlots.length}/${MAX_SLOTS} slots filled`}
          </span>
        </div>

        <div className="mt-4 flex items-center gap-2">
          {/* Left arrow */}
          <button
            type="button"
            onClick={() => scroll("left")}
            aria-label="Scroll featured manuscripts left"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.08)] text-neutral-300 transition hover:bg-[rgba(120,120,120,0.18)]"
          >
            <span aria-hidden="true">‹</span>
          </button>

          {/* Scroll track */}
          <div
            ref={scrollRef}

            className="flex flex-1 gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {/* Three identical copies for continuous infinite scroll */}
            {[0, 1, 2].map((copyIdx) => (
              <Fragment key={copyIdx}>
                {/* Filled slots */}
                {dedupedSlots.map((slot) => (
                  <Link
                    key={`${copyIdx}-${slot.id}`}
                    href={slot.owner_id === userId ? `/manuscripts/${slot.manuscript_id}/details` : `/manuscripts/${slot.manuscript_id}`}
                    className="group flex shrink-0 flex-col items-center gap-1.5"
                    title={slot.title}
                  >
                    <div className="relative h-[210px] w-36 overflow-hidden rounded-xl border-2 border-[rgba(120,120,120,0.6)] bg-neutral-900 shadow-[0_0_10px_rgba(120,120,120,0.25)] transition group-hover:border-[rgba(120,120,120,0.9)]">
                      {slot.cover_url ? (
                        <Image
                          src={slot.cover_url}
                          alt={slot.title}
                          fill
                         
                          className="object-cover transition duration-200 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center px-1 text-center text-[9px] leading-snug text-neutral-600">
                          {slot.title}
                        </div>
                      )}
                    </div>
                    <p className="max-w-[144px] truncate text-center font-mono text-[11px] text-neutral-400 tabular-nums">
                      {formatRemaining(slot.expires_at, now)}
                    </p>
                  </Link>
                ))}

                {/* Empty slots */}
                {Array.from({ length: emptyCount }).map((_, i) => (
                  <div key={`${copyIdx}-empty-${i}`} className="flex shrink-0 flex-col items-center gap-1.5">
                    <button
                      type="button"
                      onClick={userId && !userHasSlot ? openModal : undefined}
                      disabled={!userId || userHasSlot}
                      className="flex h-[210px] w-36 flex-col items-center justify-between rounded-xl border border-dashed border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.05)] px-3 py-4 text-center transition enabled:hover:border-[rgba(120,120,120,0.55)] enabled:hover:bg-[rgba(120,120,120,0.09)] disabled:cursor-default"
                    >
                      {/* CTA content */}
                      <div className="flex flex-col items-center gap-1.5">
                        <p className="text-[10px] font-semibold leading-tight text-neutral-300">Feature Your Book</p>
                        <p className="text-[9px] text-neutral-500">3 days</p>
                        <div className="flex items-center gap-1">
                          <span className="text-sm leading-none" style={{ color: "#f59e0b" }}>✿</span>
                          <span className="text-[10px] font-semibold text-neutral-300">{COST} Bloom Coins</span>
                        </div>
                      </div>

                      {/* Rules */}
                      <div className="w-full space-y-0.5 border-t border-[rgba(120,120,120,0.15)] pt-2.5 text-left">
                        <p className="text-[8px] leading-snug text-neutral-600">· 1 slot per user</p>
                        <p className="text-[8px] leading-snug text-neutral-600">· Public manuscripts only</p>
                        <p className="text-[8px] leading-snug text-neutral-600">· Non-refundable</p>
                      </div>
                    </button>
                  </div>
                ))}
              </Fragment>
            ))}
          </div>

          {/* Right arrow */}
          <button
            type="button"
            onClick={() => scroll("right")}
            aria-label="Scroll featured manuscripts right"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.08)] text-neutral-300 transition hover:bg-[rgba(120,120,120,0.18)]"
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>

        {userId && myActiveSlot && (
          <p className="mt-3 text-xs text-neutral-500">
            Your book is currently featured · expires in {formatRemaining(myActiveSlot.expires_at, now)}
          </p>
        )}
      </section>

      {/* Purchase modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="feature-modal-title"
            className="w-full max-w-md rounded-2xl border border-[rgba(120,120,120,0.5)] bg-neutral-950 p-6 shadow-2xl"
          >
            {step === "select" ? (
              <>
                <h2 id="feature-modal-title" className="text-lg font-semibold text-white">Feature Your Book</h2>
                <p className="mt-1 text-sm text-neutral-400 leading-relaxed">
                  Choose a public manuscript to feature for{" "}
                  <span className="font-semibold text-neutral-200">3 days</span>. Cost:{" "}
                  <span className="inline-flex items-center gap-1 font-semibold text-neutral-200">
                    <span style={{ color: "#f59e0b" }}>✿</span>{COST} Bloom Coins
                  </span>.
                </p>
                <p className="mt-0.5 text-xs text-neutral-600">
                  Your balance: <span style={{ color: "#f59e0b" }}>✿</span> {coins} coins
                </p>

                {userManuscripts.length === 0 ? (
                  <p className="mt-4 text-sm text-neutral-500">
                    You have no public manuscripts to feature.
                  </p>
                ) : (
                  <div className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
                    {userManuscripts.map((ms) => (
                      <button
                        key={ms.id}
                        type="button"
                        onClick={() => setSelectedMs(ms.id)}
                        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
                          selectedMs === ms.id
                            ? "border-[rgba(120,120,120,0.8)] bg-[rgba(120,120,120,0.2)]"
                            : "border-neutral-800 bg-neutral-900/40 hover:border-[rgba(120,120,120,0.5)]"
                        }`}
                      >
                        {ms.cover_url ? (
                          <Image
                            src={ms.cover_url}
                            alt={ms.title}
                            width={28}
                            height={40}
                           
                            className="shrink-0 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="h-[40px] w-[28px] shrink-0 rounded-lg bg-neutral-800" />
                        )}
                        <span className="truncate text-sm text-neutral-200">{ms.title}</span>
                      </button>
                    ))}
                  </div>
                )}

                {buyMsg && <p role="alert" className="mt-3 text-sm text-red-400">{buyMsg}</p>}

                <div className="mt-5 flex justify-end gap-2">
                  <button
                    onClick={closeModal}
                    className="rounded-lg border border-neutral-700 px-4 py-1.5 text-sm text-neutral-300 transition hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setStep("confirm")}
                    disabled={!selectedMs || coins < COST}
                    className="rounded-lg border border-[rgba(120,120,120,0.65)] bg-[rgba(120,120,120,0.2)] px-4 py-1.5 text-sm text-white transition hover:border-[rgba(120,120,120,0.9)] disabled:opacity-40"
                  >
                    Continue
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="feature-modal-title" className="text-lg font-semibold text-white">Confirm Purchase</h2>
                <p className="mt-2 text-sm text-neutral-400 leading-relaxed">
                  <span className="font-semibold text-neutral-200">{selectedTitle}</span> will
                  appear in the Featured section for{" "}
                  <span className="font-semibold text-neutral-200">3 days</span>.
                </p>
                <p className="mt-2 text-sm text-neutral-400 leading-relaxed">
                  <span className="inline-flex items-center gap-1 font-semibold text-neutral-200">
                    <span style={{ color: "#f59e0b" }}>✿</span>{COST} Bloom Coins
                  </span>{" "}
                  will be deducted from your wallet. This cost applies to all members.
                </p>
                <p className="mt-1 text-xs text-neutral-600">
                  Balance after purchase: <span style={{ color: "#f59e0b" }}>✿</span> {coins - COST} coins
                </p>

                {buyMsg && <p role="alert" className="mt-3 text-sm text-red-400">{buyMsg}</p>}

                <div className="mt-5 flex justify-end gap-2">
                  <button
                    onClick={() => setStep("select")}
                    className="rounded-lg border border-neutral-700 px-4 py-1.5 text-sm text-neutral-300 transition hover:text-white"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => void handlePurchase()}
                    disabled={buying}
                    className="rounded-lg border border-[rgba(120,120,120,0.65)] bg-[rgba(120,120,120,0.2)] px-4 py-1.5 text-sm text-white transition hover:border-[rgba(120,120,120,0.9)] disabled:opacity-40"
                  >
                    {buying ? "Processing…" : <>Confirm - <span style={{ color: "#f59e0b" }}>✿</span> {COST} Bloom Coins</>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showOutOfCoins && <OutOfCoinsModal onClose={() => setShowOutOfCoins(false)} />}
    </div>
  );
}
