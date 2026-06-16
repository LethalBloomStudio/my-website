CREATE TABLE public.birthday_coin_awards (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  awarded_year INT         NOT NULL,
  awarded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  coins_awarded INT        NOT NULL DEFAULT 100,
  UNIQUE (user_id, awarded_year)
);

ALTER TABLE public.birthday_coin_awards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own birthday awards"
  ON public.birthday_coin_awards FOR SELECT
  USING (auth.uid() = user_id);
