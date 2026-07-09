import type { SupabaseClient } from "@supabase/supabase-js";

// Extracted from app/api/feedback/mark-replies-read/route.ts so the System
// C -> System B sync (db33b98) can be unit tested without a real Supabase
// connection - see __tests__/markRepliesRead.test.ts.
export async function markRepliesReadAndSyncNotification(
  supabase: SupabaseClient,
  userId: string,
  feedbackId: string
): Promise<void> {
  const { data: replies } = await supabase
    .from("line_feedback_replies")
    .select("id")
    .eq("feedback_id", feedbackId);

  const replyIds = ((replies as { id: string }[] | null) ?? []).map((r) => r.id);
  if (replyIds.length === 0) return;

  const rows = replyIds.map((reply_id) => ({ user_id: userId, reply_id }));
  await Promise.all([
    supabase.from("feedback_reply_reads").upsert(rows, { onConflict: "user_id,reply_id", ignoreDuplicates: true }),
    // Opening the thread inline is a stronger read signal than dismissing a
    // notification preview, so it also satisfies the matching System B
    // notification(s). Deliberately one-directional: dismissing a
    // notification must NOT write to feedback_reply_reads (see
    // notifications/page.tsx markOneAsRead, which only touches
    // system_notifications).
    supabase
      .from("system_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("category", "feedback_reply")
      .eq("is_read", false)
      .eq("metadata->>feedback_id", feedbackId),
  ]);
}
