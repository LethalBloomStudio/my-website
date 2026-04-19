-- Enable realtime on manuscripts so chapter_count updates are broadcast live.
alter publication supabase_realtime add table public.manuscripts;
