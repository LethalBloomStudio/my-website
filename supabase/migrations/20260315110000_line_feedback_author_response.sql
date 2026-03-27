-- Add author_response so the author can mark whether they agreed or disagreed with feedback
ALTER TABLE public.line_feedback ADD COLUMN IF NOT EXISTS author_response text CHECK (author_response IN ('agree', 'disagree'));
