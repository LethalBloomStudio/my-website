-- Drop the existing admin-only INSERT policy
DROP POLICY IF EXISTS "Admins can create posts" ON public.discussion_posts;

-- New policy: any authenticated user can post as themselves; only admins
-- may create giveaway posts (giveaway awards Bloom Coins and stays admin-gated)
CREATE POLICY "Users can create posts"
ON public.discussion_posts
FOR INSERT
TO public
WITH CHECK (
  author_id = (SELECT auth.uid()) AND (
    type <> 'giveaway'
    OR EXISTS (
      SELECT 1 FROM accounts
      WHERE accounts.user_id = (SELECT auth.uid())
      AND accounts.is_admin = true
    )
  )
);
