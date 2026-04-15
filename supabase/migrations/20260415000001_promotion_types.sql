-- Extend applies_to to support all_users (for coins-only promos that apply to everyone)
ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_applies_to_check;
ALTER TABLE public.promotions ADD CONSTRAINT promotions_applies_to_check
  CHECK (applies_to IN ('new_signups', 'all_free', 'both', 'all_users'));

-- Update benefit default from legacy 'lethal_benefits' to 'lethal_access'
ALTER TABLE public.promotions ALTER COLUMN benefit SET DEFAULT 'lethal_access';
