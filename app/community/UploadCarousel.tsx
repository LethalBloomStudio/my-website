"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/Supabase/browser";

type CoverItem = {
  id: string;
  cover_url: string | null;
  title: string;
  owner_id: string;
};

const SPEED = 40; // px per second

const YOUTH_CATEGORIES = [
  "YA Fantasy",
  "YA Contemporary",
  "YA Romance",
  "YA Dystopian",
  "MG Fantasy",
  "MG Adventure",
];

export default function UploadCarousel({ audience = "adult" }: { audience?: "adult" | "youth" }) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [items, setItems] = useState<CoverItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Keep allowed owner IDs in a ref so the realtime handler can check them without a re-render
  const allowedOwnerIdsRef = useRef<Set<string>>(new Set());

  const outerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const isHoveredRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const offsetRef = useRef(0);

  // Initial fetch via API route (uses admin client to bypass RLS on accounts table)
  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/carousel-manuscripts?audience=${audience}`);
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json() as CoverItem[];
      allowedOwnerIdsRef.current = new Set(data.map((m) => m.owner_id));
      setItems(data);
      setLoading(false);
    })();
  }, [supabase, audience]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: filter new/updated manuscripts to only the right audience
  useEffect(() => {
    const channel = supabase
      .channel(`upload-carousel-realtime-${audience}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "manuscripts" },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new as { id: string; title: string; cover_url: string | null; visibility: string; owner_id: string; categories?: string[] | null };
          const isAllowedOwner = allowedOwnerIdsRef.current.has(row.owner_id);
          const isYouthCategory = audience === "youth" && (row.categories ?? []).some((c) => YOUTH_CATEGORIES.includes(c));
          if (row.visibility === "public" && (isAllowedOwner || isYouthCategory)) {
            setItems((prev) => {
              if (prev.some((m) => m.id === row.id)) return prev;
              return [{ id: row.id, title: row.title, cover_url: row.cover_url, owner_id: row.owner_id }, ...prev];
            });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "manuscripts" },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new as { id: string; title: string; cover_url: string | null; visibility: string; owner_id: string; categories?: string[] | null };
          const isAllowedOwner = allowedOwnerIdsRef.current.has(row.owner_id);
          const isYouthCategory = audience === "youth" && (row.categories ?? []).some((c) => YOUTH_CATEGORIES.includes(c));
          if (row.visibility === "public" && (isAllowedOwner || isYouthCategory)) {
            setItems((prev) => {
              const exists = prev.some((m) => m.id === row.id);
              if (exists) return prev.map((m) => m.id === row.id ? { ...m, title: row.title, cover_url: row.cover_url } : m);
              return [{ id: row.id, title: row.title, cover_url: row.cover_url, owner_id: row.owner_id }, ...prev];
            });
          } else {
            setItems((prev) => prev.filter((m) => m.id !== row.id));
          }
        }
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [supabase, audience]);

  // Continuous transform-based scroll
  useEffect(() => {
    if (loading || !trackRef.current) return;

    let last: number | null = null;

    function tick(ts: number) {
      const track = trackRef.current;
      if (track && last !== null && !isHoveredRef.current) {
        const copyWidth = track.scrollWidth / 2;
        if (copyWidth > 0) {
          offsetRef.current += SPEED * ((ts - last) / 1000);
          if (offsetRef.current >= copyWidth) offsetRef.current -= copyWidth;
          track.style.transform = `translateX(-${offsetRef.current}px)`;
        }
      }
      last = ts;
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [loading]);

  if (loading) {
    return (
      <div className="h-[120px] rounded-xl border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.05)] animate-pulse" />
    );
  }

  if (items.length === 0) return null;

  return (
    <div
      ref={outerRef}
      className="overflow-hidden rounded-xl border border-[rgba(120,120,120,0.25)] bg-[rgba(120,120,120,0.05)]"
      onMouseEnter={() => { isHoveredRef.current = true; }}
      onMouseLeave={() => { isHoveredRef.current = false; }}
    >
      <div
        ref={trackRef}
        className="flex gap-2 py-3 px-3 will-change-transform"
        style={{ width: "max-content" }}
      >
        {[0, 1].map((copyIdx) => (
          <Fragment key={copyIdx}>
            {items.map((item) => (
              <Link
                key={`${copyIdx}-${item.id}`}
                href={`/manuscripts/${item.id}`}
                title={item.title}
                className="group shrink-0"
                tabIndex={copyIdx === 0 ? 0 : -1}
              >
                <div className="relative h-[90px] w-[62px] overflow-hidden rounded-lg border border-[rgba(120,120,120,0.3)] bg-neutral-900 transition duration-200 group-hover:border-[rgba(120,120,120,0.7)] group-hover:scale-105 group-hover:shadow-lg">
                  {item.cover_url ? (
                    <Image
                      src={item.cover_url}
                      alt={item.title}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  ) : (
                    <div className="h-full w-full bg-[rgba(120,120,120,0.1)]" />
                  )}
                </div>
              </Link>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
