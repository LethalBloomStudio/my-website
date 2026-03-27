-- Allow either party in a friend request to delete it (unfriend)
DROP POLICY IF EXISTS "friend_requests_delete_participant" ON public.profile_friend_requests;
CREATE POLICY "friend_requests_delete_participant"
ON public.profile_friend_requests FOR DELETE
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
