-- ── bloom_events ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bloom_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT        NOT NULL,
  categories   TEXT[]      NOT NULL DEFAULT '{}' CHECK (cardinality(categories) <= 3),
  start_date   DATE        NOT NULL,
  end_date     DATE        NOT NULL,
  coin_reward  INT         NOT NULL DEFAULT 10 CHECK (coin_reward > 0),
  status       TEXT        NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'inactive')),
  created_by   UUID        REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT bloom_events_end_date_check
    CHECK (
      end_date = start_date + 7  OR
      end_date = start_date + 14 OR
      end_date = start_date + 21 OR
      end_date = start_date + 28
    )
);

-- Index for fast active-event lookups
CREATE INDEX IF NOT EXISTS bloom_events_status_idx ON public.bloom_events (status);

ALTER TABLE public.bloom_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage bloom_events"
  ON public.bloom_events FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.accounts WHERE user_id = (SELECT auth.uid()) AND is_admin = true)
  );

CREATE POLICY "Authenticated users read active bloom_events"
  ON public.bloom_events FOR SELECT TO authenticated
  USING (status = 'active');


-- ── bloom_coin_ledger: add optional event_id ──────────────────────────────────

ALTER TABLE public.bloom_coin_ledger
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.bloom_events(id) ON DELETE SET NULL;

-- Partial index — only indexes rows that actually reference an event
CREATE INDEX IF NOT EXISTS bloom_coin_ledger_event_id_idx
  ON public.bloom_coin_ledger (event_id)
  WHERE event_id IS NOT NULL;
