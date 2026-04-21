"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/Supabase/browser";
import { getPromotionState } from "@/lib/promotionState";

type EnrolledPromo = {
  promotion_expires_at: string;
  promotion_name: string | null;
  days_left: number;
};

export default function PromotionBanner() {
  const [promo, setPromo] = useState<EnrolledPromo | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("promo_banner_dismissed") === "1";
  });
  const supabase = supabaseBrowser();

  useEffect(() => {
    if (dismissed) return;

    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: acct } = await supabase
        .from("accounts")
        .select("active_promotion_id, promotion_expires_at")
        .eq("user_id", user.id)
        .maybeSingle();

      const row = acct as { active_promotion_id: string | null; promotion_expires_at: string | null } | null;
      const promoState = getPromotionState(row);
      if (promoState.shouldClearPromotion) {
        await supabase
          .from("accounts")
          .update({ active_promotion_id: null, promotion_expires_at: null })
          .eq("user_id", user.id);
        return;
      }
      if (!row?.active_promotion_id || !row.promotion_expires_at || !promoState.onActivePromo) return;

      // Fetch the promotion name
      const { data: promoData } = await supabase
        .from("promotions")
        .select("name")
        .eq("id", row.active_promotion_id)
        .maybeSingle();

      setPromo({
        promotion_expires_at: row.promotion_expires_at,
        promotion_name: (promoData as { name?: string } | null)?.name ?? null,
        days_left: Math.max(1, Math.ceil((new Date(row.promotion_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))),
      });
    }

    void check();
  }, [dismissed, supabase]);

  function dismiss() {
    setDismissed(true);
    sessionStorage.setItem("promo_banner_dismissed", "1");
  }

  if (!promo || dismissed) return null;

  return (
    <div className="relative z-40 w-full border-b border-violet-700/40 bg-violet-950/40 px-4 py-2.5 text-center text-sm backdrop-blur-sm">
      <span className="text-violet-200">
        <span className="mr-2 font-semibold text-violet-100">
          {promo.promotion_name ? `${promo.promotion_name} —` : "Promotion active —"}
        </span>
        You have full Lethal Member access.{" "}
        <span className="font-medium text-violet-100">
          {promo.days_left === 1 ? "Expires tomorrow." : `${promo.days_left} day${promo.days_left !== 1 ? "s" : ""} remaining.`}
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
