-- Prevent duplicate birthday reward ledger entries for the same award if a
-- duplicate claim ever slips past the application-level guard in
-- app/api/birthday-awards/claim/route.ts. Postgres does not support a
-- partial predicate on a table CONSTRAINT, so this is created as a partial
-- UNIQUE INDEX instead -- functionally equivalent: a duplicate insert for
-- the same birthday_award_id fails with a unique-violation error, and only
-- applies to reason = 'birthday_reward' rows, leaving every other ledger
-- entry unaffected.
CREATE UNIQUE INDEX bloom_coin_ledger_birthday_award_unique
  ON public.bloom_coin_ledger ((metadata->>'birthday_award_id'))
  WHERE reason = 'birthday_reward';
