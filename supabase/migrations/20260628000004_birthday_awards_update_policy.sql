-- Defense-in-depth: an explicit UPDATE policy so a user can claim their own
-- birthday award directly under RLS if this route is ever changed to use
-- the session client instead of the service-role client. The claim route
-- itself uses the service-role client (bypasses RLS), so this policy is not
-- load-bearing for normal operation today.
CREATE POLICY "Users can claim own birthday awards"
ON public.birthday_coin_awards
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
