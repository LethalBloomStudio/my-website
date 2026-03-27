"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/Supabase/browser";
import ChapterEditor from "@/components/ChapterEditor";
import { normalizeChapterText } from "@/lib/format/chapterNormalize";

type Manuscript = {
  id: string;
  owner_id: string;
  title: string;
  created_at?: string;
};

type Chapter = {
  chapter_order: number;
};

export default function NewChapterPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const manuscriptId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [manuscript, setManuscript] = useState<Manuscript | null>(null);
  const [memberTier, setMemberTier] = useState<"bloom" | "forge" | "lethal">("bloom");
  const [coinBalance, setCoinBalance] = useState(0);
  const [freeChapterLimit, setFreeChapterLimit] = useState(3);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  async function load() {
    if (!manuscriptId) {
      setMsg("Missing manuscript id.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setMsg(null);
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) {
      router.push("/sign-in");
      return;
    }

    const { data: account } = await supabase
      .from("accounts")
      .select("subscription_status, bloom_coins")
      .eq("user_id", userId)
      .maybeSingle();
    const accountRow = (account as { subscription_status?: string | null; bloom_coins?: number | null } | null);
    setCoinBalance(Number(accountRow?.bloom_coins ?? 0));

    const { data: profile } = await supabase
      .from("public_profiles")
      .select("writer_level")
      .eq("user_id", userId)
      .maybeSingle();
    const writerLevel = (profile as { writer_level?: string | null } | null)?.writer_level;
    const subscription = (accountRow?.subscription_status ?? "").toLowerCase();
    const lethalFromSubscription = subscription.includes("lethal");
    setMemberTier(
      writerLevel === "lethal" || lethalFromSubscription
        ? "lethal"
        : writerLevel === "forge"
          ? "forge"
          : "bloom",
    );

    const { data, error } = await supabase
      .from("manuscripts")
      .select("id, owner_id, title, created_at")
      .eq("id", manuscriptId)
      .single();
    if (error) {
      setMsg(error.message);
      setLoading(false);
      return;
    }

    const row = data as Manuscript;
    if (row.owner_id !== userId) {
      setMsg("Only the author can add chapters.");
      setLoading(false);
      return;
    }

    setManuscript(row);

    const { data: allManuscripts } = await supabase
      .from("manuscripts")
      .select("id, created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true });
    const ordered = (allManuscripts as Array<{ id: string; created_at: string }> | null) ?? [];
    const idx = ordered.findIndex((m) => m.id === manuscriptId);
    setFreeChapterLimit(idx <= 0 ? 3 : 1);

    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manuscriptId]);

  async function spendBloomCoins(amount: number, reason: string, metadata: Record<string, unknown>) {
    if (!manuscript || amount <= 0) return { ok: true as const };
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return { ok: false as const, error: "Please sign in." };
    const nextBalance = coinBalance - amount;
    if (nextBalance < 0) {
      return { ok: false as const, error: `You need ${amount} Bloom Coins. Current balance: ${coinBalance}.` };
    }
    const { data: updated, error: updateError } = await supabase
      .from("accounts")
      .update({ bloom_coins: nextBalance })
      .eq("user_id", uid)
      .eq("bloom_coins", coinBalance)
      .select("user_id")
      .maybeSingle();
    if (updateError || !updated) {
      return { ok: false as const, error: "Could not charge Bloom Coins. Please refresh and try again." };
    }
    const { error: ledgerError } = await supabase.from("bloom_coin_ledger").insert({
      user_id: uid,
      delta: -amount,
      reason,
      metadata,
    });
    if (ledgerError) return { ok: false as const, error: ledgerError.message };
    setCoinBalance(nextBalance);
    return { ok: true as const };
  }

  async function submit() {
    if (!manuscript) return;
    if (!content.trim()) return setMsg("Chapter content is required.");

    const { data: rows } = await supabase
      .from("manuscript_chapters")
      .select("chapter_order")
      .eq("manuscript_id", manuscript.id)
      .order("chapter_order", { ascending: false })
      .limit(1);

    const latest = ((rows as Chapter[] | null) ?? [])[0];
    const nextOrder = (latest?.chapter_order ?? 0) + 1;
    const isLethalMember = memberTier === "lethal";
    const chapterCount = nextOrder - 1;
    const chapterCost = !isLethalMember && chapterCount >= freeChapterLimit ? 10 : 0;
    if (chapterCost > 0) {
      const charge = await spendBloomCoins(chapterCost, "extra_chapter_upload", {
        manuscript_id: manuscript.id,
        chapter_order: nextOrder,
      });
      if (!charge.ok) return setMsg(charge.error);
    }

    const { error } = await supabase.from("manuscript_chapters").insert({
      manuscript_id: manuscript.id,
      chapter_order: nextOrder,
      title: title.trim() || `Chapter ${nextOrder}`,
      content: content.trim(),
      is_private: true,
    });
    if (error) return setMsg(error.message);

    router.push(`/manuscripts/${manuscript.id}/details`);
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16 text-neutral-100">
        <p>Loading...</p>
      </main>
    );
  }

  if (!manuscript) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16 text-neutral-100">
        <p>{msg ?? "Not available."}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Add Chapter</h1>
        <p className="mt-2 text-sm text-neutral-300">{manuscript.title}</p>
        <p className="mt-1 text-xs text-neutral-400">
          {memberTier === "lethal"
            ? "Lethal members: unlimited chapters."
            : freeChapterLimit === 3
              ? "First manuscript: 3 free chapters, then 10 Bloom Coins per chapter."
              : "This manuscript includes 1 chapter; additional chapters cost 10 Bloom Coins each."}{" "}
          Balance: {coinBalance} Bloom Coins.
        </p>

        {msg ? (
          <div className="mt-4 rounded-lg border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.12)] p-3 text-sm text-white">
            {msg}
          </div>
        ) : null}

        <div className="mt-6 rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-5">
          <label className="block">
            <div className="text-sm text-neutral-300">Chapter title</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Defaults to Chapter number"
              className="mt-2 h-11 w-full rounded-lg border border-neutral-800 bg-neutral-900/40 px-4"
            />
          </label>

          <label className="mt-4 block">
            <div className="text-sm text-neutral-300">Chapter content</div>
            <ChapterEditor
              value={content}
              onChange={setContent}
              normalize={normalizeChapterText}
              className="mt-2 w-full min-h-[22rem] rounded-xl border border-neutral-800 bg-[rgba(18,18,18,0.85)] px-8 py-6 font-['Merriweather','Georgia','Times_New_Roman',serif] text-[16px] leading-[2] text-neutral-100 focus:border-[rgba(120,120,120,0.5)]"
              placeholder="Begin your chapter here. Press Enter to start a new paragraph. Shift+Enter for a line break within a paragraph."
            />
          </label>

          <div className="mt-4 flex gap-2">
            <button onClick={submit} className="h-11 rounded-lg px-4 text-sm font-medium">
              Save Chapter
            </button>
            <button
              onClick={() => router.push(`/manuscripts/${manuscript.id}/details`)}
              className="h-11 rounded-lg border border-neutral-700 bg-neutral-900/60 px-4 text-sm text-neutral-200"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
