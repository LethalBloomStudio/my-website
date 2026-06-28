CREATE POLICY "Authors and admins can update posts"
ON public.discussion_posts
FOR UPDATE
TO public
USING (
  author_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1 FROM accounts
    WHERE accounts.user_id = (SELECT auth.uid())
    AND accounts.is_admin = true
  )
)
WITH CHECK (
  author_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1 FROM accounts
    WHERE accounts.user_id = (SELECT auth.uid())
    AND accounts.is_admin = true
  )
);
