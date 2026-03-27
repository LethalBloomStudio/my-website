import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/Supabase/admin";
import WalletTabs from "./WalletTabs";

type AccountRow = {
  full_name: string | null;
  bloom_coins?: number | null;
  subscription_status: string | null;
  age_category?: string | null;
};

type WalletLedgerRow = {
  id: string;
  delta: number;
  reason: string;
  created_at: string;
};

type LinkedChild = { userId: string; name: string; balance: number; subscriptionTier: "free" | "unlimited" };

export default async function WalletPage({
  searchParams,
}: {
  searchParams?: Promise<{ gift_to?: string; amount?: string }>;
}) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) redirect("/sign-in");

  const { data } = await supabase.from("accounts").select("*, is_deactivated").eq("user_id", user.id).maybeSingle();
  if ((data as { is_deactivated?: boolean } | null)?.is_deactivated) redirect("/account");
  const { data: ledgerData } = await supabase
    .from("bloom_coin_ledger")
    .select("id, delta, reason, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const account = (data as AccountRow | null) ?? null;
  const ledger = (ledgerData as WalletLedgerRow[] | null) ?? [];
  const displayName = account?.full_name?.trim() || user.email?.split("@")[0] || "Writer";
  const balance = Number(account?.bloom_coins ?? 0);
  const subscription = account?.subscription_status?.trim() || "free";
  const isYouth = account?.age_category === "youth_13_17";

  // For youth accounts: find their parent link (use admin to bypass RLS)
  let parentUserId: string | null = null;
  if (isYouth) {
    const admin = supabaseAdmin();
    const { data: link } = await admin
      .from("youth_links")
      .select("parent_user_id")
      .eq("child_user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    parentUserId = (link as { parent_user_id?: string } | null)?.parent_user_id ?? null;
  }

  // For parent accounts: always fetch all linked youth accounts
  let linkedChildren: LinkedChild[] = [];
  let defaultChildId: string | null = null;
  if (!isYouth) {
    const admin = supabaseAdmin();
    const { data: linkRows } = await admin
      .from("youth_links")
      .select("child_user_id, child_name, subscription_tier")
      .eq("parent_user_id", user.id)
      .eq("status", "active");

    const links = (linkRows as Array<{ child_user_id: string; child_name: string; subscription_tier: "free" | "unlimited" }> | null) ?? [];
    if (links.length > 0) {
      const childIds = links.map((l) => l.child_user_id);
      const { data: childAccts } = await admin
        .from("accounts")
        .select("user_id, bloom_coins")
        .in("user_id", childIds);
      const balanceMap = new Map(
        ((childAccts as Array<{ user_id: string; bloom_coins?: number }> | null) ?? []).map(
          (a) => [a.user_id, Number(a.bloom_coins ?? 0)]
        )
      );
      linkedChildren = links.map((l) => ({
        userId: l.child_user_id,
        name: l.child_name,
        balance: balanceMap.get(l.child_user_id) ?? 0,
        subscriptionTier: l.subscription_tier,
      }));
    }

    // If ?gift_to= param is present and valid, pre-select that child
    const params = (await searchParams) ?? {};
    const giftToId = params.gift_to?.trim();
    if (giftToId && linkedChildren.some((c) => c.userId === giftToId)) {
      defaultChildId = giftToId;
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Wallet</h1>
        <p className="mt-2 text-neutral-300">Store and track your Bloom Coins.</p>
        <WalletTabs
          displayName={displayName}
          balance={balance}
          subscription={subscription}
          ledger={ledger}
          isYouth={isYouth}
          parentUserId={parentUserId}
          linkedChildren={linkedChildren}
          defaultChildId={defaultChildId}
        />
      </div>
    </main>
  );
}
