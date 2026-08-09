-- ─── manuscript_chapters chapter_order uniqueness ───────────────────────────
--
-- Prevents two chapters in the same manuscript from ever sharing a
-- chapter_order value. Without this, a client-side race at chapter creation
-- (two "Add chapter" inserts computing the same next order from a stale
-- in-memory array) could leave two rows tied on chapter_order. Since every
-- read orders by `chapter_order ASC` alone with no secondary tiebreaker,
-- Postgres does not guarantee a stable order among tied rows — the same two
-- chapters could come back in a different order across two different page
-- loads with no write happening in between, which looks indistinguishable
-- from a silent reorder.
--
-- DEFERRABLE INITIALLY DEFERRED: a full-list renumber (see the
-- reorder_manuscript_chapters RPC in the prior migration) necessarily passes
-- through intermediate states where two rows transiently hold the same
-- chapter_order mid-transaction, before the batch finishes. Deferring the
-- check to COMMIT means only the final state has to be unique, not every
-- intermediate step.
--
-- Verified against production before writing this migration: 0 duplicate
-- (manuscript_id, chapter_order) pairs across 265 chapter rows / 21
-- manuscripts, so this is expected to apply cleanly with no data fix needed.

ALTER TABLE public.manuscript_chapters
  ADD CONSTRAINT manuscript_chapters_order_unique
  UNIQUE (manuscript_id, chapter_order)
  DEFERRABLE INITIALLY DEFERRED;
