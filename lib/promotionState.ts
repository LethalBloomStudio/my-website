export type PromotionAccountFields = {
  active_promotion_id?: string | null;
  promotion_expires_at?: string | null;
};

function parsePromotionExpiry(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getPromotionState(
  row: PromotionAccountFields | null | undefined,
  now: Date = new Date(),
) {
  const hasStoredPromotion = !!(row?.active_promotion_id || row?.promotion_expires_at);
  const expiresAt = parsePromotionExpiry(row?.promotion_expires_at);
  const onActivePromo = !!(row?.active_promotion_id && expiresAt && expiresAt > now);
  const shouldClearPromotion = !!(hasStoredPromotion && !onActivePromo && (!expiresAt || expiresAt <= now));

  return {
    expiresAt,
    onActivePromo,
    shouldClearPromotion,
  };
}
