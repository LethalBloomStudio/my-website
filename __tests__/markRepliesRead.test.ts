import assert from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { markRepliesReadAndSyncNotification } from "../lib/markRepliesRead.ts";

type RecordedCall = {
  table: string;
  op: "select" | "upsert" | "update";
  arg: unknown;
  eqs: [string, unknown][];
};

// Minimal stand-in for the parts of the PostgREST query builder this
// function actually uses: chainable .eq() (like the real builder, each call
// returns itself) and thenable (awaiting the chain at any point triggers
// resolution, matching how supabase-js's builder implements PromiseLike).
function makeBuilder(call: RecordedCall, result: { data: unknown; error: unknown }) {
  const builder = {
    eq(col: string, val: unknown) {
      call.eqs.push([col, val]);
      return builder;
    },
    then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return builder;
}

function createMockSupabase(opts: { replies?: { id: string }[] }) {
  const calls: RecordedCall[] = [];
  const repliesResult = { data: opts.replies ?? [], error: null };

  const client = {
    from(table: string) {
      return {
        select(cols: string) {
          const call: RecordedCall = { table, op: "select", arg: cols, eqs: [] };
          calls.push(call);
          return makeBuilder(call, repliesResult);
        },
        upsert(rows: unknown, upsertOpts: unknown) {
          const call: RecordedCall = { table, op: "upsert", arg: { rows, upsertOpts }, eqs: [] };
          calls.push(call);
          return makeBuilder(call, { data: null, error: null });
        },
        update(patch: unknown) {
          const call: RecordedCall = { table, op: "update", arg: patch, eqs: [] };
          calls.push(call);
          return makeBuilder(call, { data: null, error: null });
        },
      };
    },
  };

  return { client: client as unknown as SupabaseClient, calls };
}

describe("markRepliesReadAndSyncNotification - System C -> System B sync (db33b98)", () => {
  it("opening a thread inline upserts feedback_reply_reads (System C) AND marks the matching system_notifications row read (System B)", async () => {
    const { client, calls } = createMockSupabase({ replies: [{ id: "reply-1" }, { id: "reply-2" }] });

    await markRepliesReadAndSyncNotification(client, "user-1", "feedback-1");

    const upsertCall = calls.find((c) => c.table === "feedback_reply_reads" && c.op === "upsert");
    assert.ok(upsertCall, "feedback_reply_reads must be upserted (System C write)");
    assert.deepStrictEqual((upsertCall!.arg as { rows: unknown }).rows, [
      { user_id: "user-1", reply_id: "reply-1" },
      { user_id: "user-1", reply_id: "reply-2" },
    ]);

    const notifCall = calls.find((c) => c.table === "system_notifications" && c.op === "update");
    assert.ok(notifCall, "system_notifications must be updated (System B sync) in the same request");
    const patch = notifCall!.arg as { is_read: boolean; read_at: string };
    assert.equal(patch.is_read, true);
    assert.equal(typeof patch.read_at, "string");

    const filters = notifCall!.eqs;
    assert.ok(filters.some(([col, val]) => col === "user_id" && val === "user-1"));
    assert.ok(filters.some(([col, val]) => col === "category" && val === "feedback_reply"));
    assert.ok(filters.some(([col, val]) => col === "is_read" && val === false));
    assert.ok(filters.some(([col, val]) => col === "metadata->>feedback_id" && val === "feedback-1"));
  });

  it("marks every matching system_notifications row read, not just one - no id/limit filter restricts it to a single row", async () => {
    const { client, calls } = createMockSupabase({ replies: [{ id: "reply-1" }] });

    await markRepliesReadAndSyncNotification(client, "user-1", "feedback-1");

    const notifCall = calls.find((c) => c.table === "system_notifications" && c.op === "update")!;
    const filteredColumns = notifCall.eqs.map(([col]) => col);
    assert.ok(
      !filteredColumns.includes("id"),
      "must not filter by a specific notification id - if a retry or edge case produced more than one matching row for this feedback thread, every one of them should be marked read"
    );
  });

  it("does nothing when the feedback thread has no replies yet", async () => {
    const { client, calls } = createMockSupabase({ replies: [] });

    await markRepliesReadAndSyncNotification(client, "user-1", "feedback-1");

    assert.equal(
      calls.filter((c) => c.op !== "select").length,
      0,
      "no writes should happen for a thread with zero replies"
    );
  });
});

describe("System B -> System C boundary is one-directional (db33b98)", () => {
  // The reverse direction (dismissing a notification syncing back into
  // feedback_reply_reads) is deliberately not implemented - see the prior
  // audit's conclusion that a notification dismissal doesn't prove the user
  // opened the actual thread. The route that dismisses notifications
  // (app/api/notifications/read-keys/route.ts) can't be imported directly
  // here: it pulls in supabaseServer via the "@/" alias, which plain
  // `node --test` can't resolve, and this repo's test script doesn't enable
  // node:test's experimental module-mocking.
  //
  // IMPORTANT: the check below is NOT an executable enforcement of the
  // one-directional boundary - it's a string search over a single file, not
  // a guarantee about behavior. It only proves that today,
  // read-keys/route.ts's own source doesn't mention feedback_reply_reads.
  // It would NOT catch the boundary being violated by: dismiss logic moving
  // into a different file, a shared helper that writes to
  // feedback_reply_reads being called from this route without the literal
  // string appearing here, or the reverse sync being added to the
  // client-side dismiss path in notifications/page.tsx instead of this
  // route. Treat this as documentation of current behavior that happens to
  // be machine-checked, not as proof the boundary can't regress elsewhere.
  it("the notification read-keys route (System B dismiss path) never references feedback_reply_reads", () => {
    const source = readFileSync(
      new URL("../app/api/notifications/read-keys/route.ts", import.meta.url),
      "utf8"
    );
    assert.ok(
      !source.includes("feedback_reply_reads"),
      "dismissing a notification (System B) must not touch feedback_reply_reads (System C) - that direction is intentionally only in markRepliesReadAndSyncNotification"
    );
  });
});
