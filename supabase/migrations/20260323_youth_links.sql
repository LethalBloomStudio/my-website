-- Youth account management
-- Links a parent's adult account to one or more youth sub-accounts (ages 13–17)
-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS youth_links (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  child_user_id      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  child_email        text        NOT NULL,
  child_name         text        NOT NULL,
  child_dob          date        NOT NULL,
  subscription_tier  text        NOT NULL DEFAULT 'free'
                                 CHECK (subscription_tier IN ('free', 'unlimited')),
  status             text        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'active', 'revoked')),
  invite_token       uuid        UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  invite_expires_at  timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS youth_links_parent_idx ON youth_links (parent_user_id);
CREATE INDEX IF NOT EXISTS youth_links_child_idx  ON youth_links (child_user_id);

-- Row-level security
ALTER TABLE youth_links ENABLE ROW LEVEL SECURITY;

-- Parents can read their own linked children
CREATE POLICY "parent_select_youth_links" ON youth_links
  FOR SELECT USING (auth.uid() = parent_user_id);

-- Parents can create new youth links
CREATE POLICY "parent_insert_youth_links" ON youth_links
  FOR INSERT WITH CHECK (auth.uid() = parent_user_id);

-- Parents can update their youth links (tier changes, status)
CREATE POLICY "parent_update_youth_links" ON youth_links
  FOR UPDATE USING (auth.uid() = parent_user_id);

-- -----------------------------------------------------------------------
-- Optional: trigger to notify parent when child uploads a manuscript
-- -----------------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION notify_parent_on_child_manuscript()
-- RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
-- DECLARE
--   parent_id uuid;
-- BEGIN
--   SELECT parent_user_id INTO parent_id
--     FROM youth_links
--     WHERE child_user_id = NEW.owner_id AND status = 'active'
--     LIMIT 1;
--
--   IF parent_id IS NOT NULL THEN
--     INSERT INTO system_notifications (user_id, category, title, body, severity)
--     VALUES (
--       parent_id,
--       'safety',
--       'Your child published something new',
--       'A new manuscript or chapter has been posted by your linked youth account.',
--       'info'
--     );
--   END IF;
--
--   RETURN NEW;
-- END;
-- $$;
--
-- CREATE TRIGGER manuscripts_notify_parent
--   AFTER INSERT ON manuscripts
--   FOR EACH ROW EXECUTE FUNCTION notify_parent_on_child_manuscript();
