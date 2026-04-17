"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/Supabase/browser";

type EnrolledPromo = {
  promotion_expires_at: string;
  promotion_name: string | null;
};

export default function PromotionBanner() {
  const [promo, setPromo] = useState<EnrolledPromo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const supabase = supabaseBrowser();

  useEffect(() => {
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem("promo_banner_dismissed")) {
      setDismissed(true);
      return;
    }

    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: acct } = await supabase
        .from("accounts")
        .select("active_promotion_id, promotion_expires_at")
        .eq("user_id", user.id)
        .maybeSingle();

      const row = acct as { active_promotion_id: string | null; promotion_expires_at: string | null } | null;
      if (!row?.active_promotion_id || !row.promotion_expires_at) return;

      const expires = new Date(row.promotion_expires_at);
      if (expires <= new Date()) return;

      // Fetch the promotion name
      const { data: promoData } = await supabase
        .from("promotions")
        .select("name")
        .eq("id", row.active_promotion_id)
        .maybeSingle();

      setPromo({
        promotion_expires_at: row.promotion_expires_at,
        promotion_name: (promoData as { name?: string } | null)?.name ?? null,
      });
    }

    void check();
  }, [supabase]);

  function dismiss() {
    setDismissed(true);
    sessionStorage.setItem("promo_banner_dismissed", "1");
  }

  if (!promo || dismissed) return null;

  const expires = new Date(promo.promotion_expires_at);
  const msLeft = expires.getTime() - Date.now();
  const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

  return (
    <div className="relative z-40 w-full border-b border-violet-700/40 bg-violet-950/40 px-4 py-2.5 text-center text-sm backdrop-blur-sm">
      <span className="text-violet-200">
        <span className="mr-2 font-semibold text-violet-100">
          {promo.promotion_name ? `${promo.promotion_name} —` : "Promotion active —"}
        </span>
        You have full Lethal Member access.{" "}
        <span className="font-medium text-violet-100">
          {daysLeft === 1 ? "Expires tomorrow." : `${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining.`}
        </span>
      </span>
      <button
        onClick={dismiss}
        aria-label="Dismiss promotion banner"
        className="absolute right-4 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full text-violet-400 hover:text-white hover:bg-white/10 transition"
      >
        ✕
      </button>
    </div>
  );
}
