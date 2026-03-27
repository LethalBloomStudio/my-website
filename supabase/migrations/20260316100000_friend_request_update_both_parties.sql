-- Allow either party (sender or receiver) to update a friend request.
-- Previously only the receiver could update, which silently blocked the sender
-- from setting status to "unfriended".
DROP POLICY IF EXISTS "friend_requests_update_receiver" ON public.profile_friend_requests;
CREATE POLICY "friend_requests_update_participant"
ON public.profile_friend_requests FOR UPDATE
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
