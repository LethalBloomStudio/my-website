-- ── Profile Announcements v2: categories, polls, coin challenges, threaded comments ──

-- Extend profile_announcements with new fields
ALTER TABLE public.profile_announcements
  ADD COLUMN IF NOT EXISTS type          text         NOT NULL DEFAULT 'update',
  ADD COLUMN IF NOT EXISTS title         text,
  ADD COLUMN IF NOT EXISTS poll_options  jsonb,
  ADD COLUMN IF NOT EXISTS coin_prize    integer,
  ADD COLUMN IF NOT EXISTS ends_at       timestamptz,
  ADD COLUMN IF NOT EXISTS winner_id     uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS winner_drawn  boolean      NOT NULL DEFAULT false;

-- Allow UPDATE on own rows (needed for winner_drawn / winner_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profile_announcements'
      AND policyname = 'announcements_update_own'
  ) THEN
    CREATE POLICY "announcements_update_own"
      ON public.profile_announcements FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END$$;

-- ── Add threading columns to profile_announcement_comments ──
ALTER TABLE public.profile_announcement_comments
  ADD COLUMN IF NOT EXISTS parent_id          uuid REFERENCES public.profile_announcement_comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reply_to_id        uuid REFERENCES public.profile_announcement_comments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reply_to_author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── Comment likes ──
CREATE TABLE IF NOT EXISTS public.profile_announcement_comment_likes (
  comment_id  uuid        NOT NULL REFERENCES public.profile_announcement_comments(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

ALTER TABLE public.profile_announcement_comment_likes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_announcement_comment_likes' AND policyname='ann_comment_likes_select') THEN
    CREATE POLICY "ann_comment_likes_select" ON public.profile_announcement_comment_likes FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_announcement_comment_likes' AND policyname='ann_comment_likes_insert') THEN
    CREATE POLICY "ann_comment_likes_insert" ON public.profile_announcement_comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_announcement_comment_likes' AND policyname='ann_comment_likes_delete') THEN
    CREATE POLICY "ann_comment_likes_delete" ON public.profile_announcement_comment_likes FOR DELETE USING (auth.uid() = user_id);
  END IF;
END$$;

-- ── Poll votes ──
CREATE TABLE IF NOT EXISTS public.profile_announcement_poll_votes (
  announcement_id  uuid        NOT NULL REFERENCES public.profile_announcements(id) ON DELETE CASCADE,
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_index     integer     NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

ALTER TABLE public.profile_announcement_poll_votes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_announcement_poll_votes' AND policyname='ann_poll_votes_select') THEN
    CREATE POLICY "ann_poll_votes_select" ON public.profile_announcement_poll_votes FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_announcement_poll_votes' AND policyname='ann_poll_votes_insert') THEN
    CREATE POLICY "ann_poll_votes_insert" ON public.profile_announcement_poll_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END$$;
